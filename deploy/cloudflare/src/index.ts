/**
 * Cloudflare Worker + Container facade for the IMBERE DATA FastAPI engine.
 *
 * One Worker, one Durable Object instance, one container. Every request — GET /api/meta,
 * POST /api/simulate, whatever — is forwarded unchanged to the single FastAPI process, because
 * the engine keeps its fitted model, its POST cache and its rate-limit windows in process
 * memory. Spreading requests over several containers would duplicate the ~1 GB model fit and
 * split the cache, so routing is deliberately not load balanced.
 */
import { DurableObject } from "cloudflare:workers";

/** Port uvicorn binds inside the image (see Dockerfile). */
const CONTAINER_PORT = 8000;

/** Durable Object name that owns the only container instance. */
const INSTANCE_NAME = "imbere-api";

/**
 * How long the container keeps running after the last request. This is a billing knob, not a
 * performance knob: Containers bill provisioned memory for every second the instance is up,
 * and the Workers Paid plan includes 25 GiB-hours a month. A `basic` instance (1 GiB) is up
 * for ~25 hours of included usage, so leaving it to idle all day is what costs money.
 */
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Startup budget. The image bakes the fitted model in at build time (see Dockerfile and
 * api/app/datastore.py `freeze`), so a cold start is an import plus a ~3 MB pickle load rather
 * than a model fit: about 2.5 s on a full core, and the headroom below covers a fractional one.
 *
 * The fit this used to cover takes ~20 s on a full core, which is past the 60 s POST budget the
 * interface allows (web/lib/api.ts) once a container gets a quarter of a core.
 */
const READY_TIMEOUT_MS = 90 * 1000;
const READY_POLL_MS = 250;
const READY_PROBE_TIMEOUT_MS = 2000;

interface Env {
  IMBERE_CONTAINER: DurableObjectNamespace<ImbereContainer>;
}

export class ImbereContainer extends DurableObject<Env> {
  private starting: Promise<void> | undefined;
  private monitoring: Promise<void> | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // A Durable Object restart (deploy, eviction) comes back without its timeout, while the
    // container it owns may still be running.
    if (ctx.container?.running) {
      void ctx.blockConcurrencyWhile(() =>
        ctx.container!.setInactivityTimeout(INACTIVITY_TIMEOUT_MS),
      );
      this.observeExit();
    }
  }

  async fetch(request: Request): Promise<Response> {
    const started = Date.now();

    // Share one startup attempt across concurrent requests, and clear it only on failure so a
    // successful boot does not re-probe on every subsequent request.
    if (!this.starting) {
      this.starting = this.startAndWaitForModel().catch((error: unknown) => {
        this.starting = undefined;
        throw error;
      });
    }
    await this.starting;

    const url = new URL(request.url);
    url.protocol = "http:";
    url.host = "container";

    const forwarded = new Request(url, request);
    forwarded.headers.delete("host");

    // The app rate-limits per client from request.client.host. Without this, every request
    // would arrive from the container's internal address and share one 90/min bucket.
    const clientIp = request.headers.get("cf-connecting-ip");
    if (clientIp) forwarded.headers.set("x-forwarded-for", clientIp);

    const response = await this.ctx.container!.getTcpPort(CONTAINER_PORT).fetch(forwarded);

    // Surface the cold-start cost instead of hiding it: the dashboard shows 30-60 s clicks and
    // this header says whether the wait was boot or the engine.
    const headers = new Headers(response.headers);
    headers.set("x-imbere-boot-ms", String(Date.now() - started));
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  /** Start the container if needed, then wait until the model is actually fitted. */
  private async startAndWaitForModel(): Promise<void> {
    const container = this.ctx.container;
    if (!container) throw new Error("This Durable Object has no container binding");

    if (!container.running) {
      container.start({
        image: container.images.api,
        // 1 GiB. `lite` (256 MiB) is not enough for pandas + the model fit.
        instance: "basic",
        // The engine is self-contained: it reads committed files and never calls out.
        enableInternet: false,
        env: {
          IMBERE_WARM_ON_STARTUP: "1",
          IMBERE_RATE_LIMIT: "90",
          IMBERE_CACHE_SECONDS: "300",
          IMBERE_POST_CACHE: "128",
        },
      });
      this.observeExit();
    }

    await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);

    const port = container.getTcpPort(CONTAINER_PORT);
    const deadline = Date.now() + READY_TIMEOUT_MS;
    let lastError = "no response";

    while (Date.now() < deadline) {
      try {
        const probe = await port.fetch("http://container/api/health", {
          signal: AbortSignal.timeout(READY_PROBE_TIMEOUT_MS),
        });
        if (probe.ok) {
          // /api/health answers in milliseconds while the fit runs in a background thread, so
          // a 200 is not readiness. Wait for the model_ready flag it reports.
          const body = (await probe.json()) as { model_ready?: boolean };
          if (body.model_ready !== false) return;
          lastError = "model still fitting";
        } else {
          lastError = `/api/health responded ${probe.status}`;
        }
      } catch (error) {
        // The port is not listening yet during boot; retry the probe only.
        lastError = error instanceof Error ? error.message : String(error);
      }
      await scheduler.wait(READY_POLL_MS);
    }

    // Do not fail the request: the container is probably just slower than the budget, and a
    // blocked response beats a 502. Forward it and let the download, not the proxy, decide.
    console.warn(`container not ready after ${READY_TIMEOUT_MS} ms (${lastError}); forwarding`);
  }

  private observeExit(): void {
    if (this.monitoring) return;
    const container = this.ctx.container;
    if (!container) return;

    this.monitoring = container
      .monitor()
      .then(() => console.log("imbere container exited"))
      .catch((error: unknown) => console.error("imbere container failed:", error))
      .finally(() => {
        this.monitoring = undefined;
        // A dead container must be restartable on the next request.
        this.starting = undefined;
      });

    this.ctx.waitUntil(this.monitoring);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const stub = env.IMBERE_CONTAINER.get(env.IMBERE_CONTAINER.idFromName(INSTANCE_NAME));
    return stub.fetch(request);
  },
};
