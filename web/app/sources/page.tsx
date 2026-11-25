"use client";

import { useCallback, useEffect, useState } from "react";

import { PanelState, SectionHeading, SkeletonTableRows, SourceNote, Tag } from "@/components/Ui";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, type Meta } from "@/lib/api";

const REPO = "https://github.com/IsMushi/imbere-data/blob/main";

/** What each published source is actually used for. Keyed by the id the API returns. */
const USED_FOR: Record<string, string> = {
  eicv7_poverty_profile:
    "District poverty rates and changes (Annex B), national and province headcounts, the poverty lines the calibration targets.",
  eicv7_tables:
    "Household marginals: education, income source, assets, medical insurance, sanitation and floor, shock exposure and coping responses.",
  finscope2024:
    "Financial inclusion among adults, the four financial-health bands, climate-shock exposure and mitigation measures.",
  census2022: "District population, used to allocate the synthetic sample and to derive household counts.",
};

const FILES: [string, string, string][] = [
  ["data/raw/district_poverty_eicv7.csv", "District poverty rates and the 2017 comparison", "Transcribed"],
  ["data/raw/district_population_2022.csv", "District population, Census 2022", "Transcribed"],
  ["data/reference/national_indicators.json", "National, inclusion, service and shock indicators; poverty lines", "Curated"],
  ["data/reference/shocks.json", "Shock incidence and coping responses by poverty status", "Curated"],
  ["data/reference/vup.json", "VUP components, transfer sizes, payment timeliness", "Curated"],
  ["data/reference/round.json", "Round identity, seed, sample size, headline rates", "Curated"],
  ["data/processed/districts.json", "District aggregates served by the API", "Generated"],
  ["data/processed/meta.json", "Everything the interface reads as context", "Generated"],
  ["data/processed/households.csv", "Calibrated synthetic households — not survey records", "Generated"],
];

export default function SourcesPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    apiGet<Meta>("/api/meta", "/api/meta.json")
      .then(setMeta)
      .catch((e: Error) => setError(e));
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return (
    <div className="shell pt-10">
      <div className="max-w-[68ch]">
        <div className="flex flex-wrap items-center gap-2">
          <Tag tone="neutral">Provenance</Tag>
          <Tag tone="real">Four published sources</Tag>
          <Tag tone="modelled">One synthetic layer</Tag>
        </div>
        <h1 className="display mt-5 text-[36px] leading-[1.04] sm:text-[48px]">
          Every figure has a source or an assumption.
        </h1>
        <p className="mt-4 text-[19.5px] leading-[1.65] text-ink-soft">
          Where each number comes from, what it is used for, and which parts of the site are our own
          assumptions rather than anyone&apos;s measurement. The citations are served by the API, so
          they cannot drift from the values they describe.
        </p>
      </div>

      {error ? (
        <div className="mt-8">
          <PanelState kind="error" onRetry={retry}>
            Could not load the source list — {error.message}
          </PanelState>
        </div>
      ) : null}

      <section className="mt-12" aria-label="Published sources">
        <SectionHeading module="01" title="Published sources">
          Statistics that a statistical office or AFR published. Where the site says{" "}
          <em>Measured</em>, it came from one of these.
        </SectionHeading>
        <Table className="min-w-[760px]">
          <TableCaption className="text-left">
            Publisher, year, licence and what each source is used for.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Source</TableHead>
              <TableHead scope="col">Publisher</TableHead>
              <TableHead scope="col" className="text-right">
                Year
              </TableHead>
              <TableHead scope="col">What we used it for</TableHead>
              <TableHead scope="col">Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {meta ? (
              meta.sources.map((s) => (
                <TableRow key={s.id}>
                  <th scope="row" className="py-3 pr-4 text-left align-top font-normal">
                    {s.title}
                    <span className="block text-[13px] text-ink-soft">{s.license}</span>
                  </th>
                  <TableCell className="py-3 pr-4 align-top text-[14px] text-ink-soft">
                    {s.publisher}
                  </TableCell>
                  <TableCell className="tnum py-3 pr-4 text-right align-top">{s.year}</TableCell>
                  <TableCell className="max-w-[46ch] py-3 pr-4 align-top text-[14px] text-ink-soft">
                    {USED_FOR[s.id] ?? "—"}
                  </TableCell>
                  <TableCell className="py-3 align-top">
                    <a
                      className="font-medium text-primary-deep underline underline-offset-2"
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <SkeletonTableRows rows={4} cols={5} />
            )}
          </TableBody>
        </Table>
      </section>

      <section className="mt-14" aria-label="Assumed, not sourced">
        <SectionHeading module="02" title="Assumed, not sourced">
          These are settings we chose. They are labelled <em>Assumed</em> wherever they appear, and
          changing one changes the result.
        </SectionHeading>
        <ul className="max-w-[84ch] space-y-3 text-[15.5px] leading-relaxed text-ink-soft">
          <li>
            <span className="font-medium text-ink">Shock exposure and loss.</span> How much of a
            district a drought or flood touches, and how much consumption it destroys, per shock type
            and severity. The table is on{" "}
            <a className="text-primary-deep underline underline-offset-2" href="/methodology#shocks">
              the method page
            </a>
            .
          </li>
          <li>
            <span className="font-medium text-ink">Severity mapping.</span> A 0–100 slider scales
            exposure and loss linearly about the 50 baseline. It is a communication device, not an
            estimated dose–response curve.
          </li>
          <li>
            <span className="font-medium text-ink">Budget and transfer defaults.</span> RWF 300m of
            budget and a RWF 150,000 per-household transfer are the documented defaults, chosen to
            sit near the scale of an existing district programme. Both are controls on the targeting
            page.
          </li>
          <li>
            <span className="font-medium text-ink">AUC threshold on the model.</span> Precision and
            recall use a 0.50 probability cut. An allocation uses the ranking, not this cut.
          </li>
        </ul>
      </section>

      <section className="mt-14" aria-label="Files in the repository">
        <SectionHeading module="03" title="Files in the repository">
          Transcribed inputs are small and committed; the downloaded PDF and XLSX stay local. The
          generated layer is committed so a clone runs without a build step.
        </SectionHeading>
        <Table className="min-w-[560px]">
          <TableCaption className="text-left">
            Where each input and output lives, and whether it is published, curated or generated.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Path</TableHead>
              <TableHead scope="col">What it holds</TableHead>
              <TableHead scope="col" className="text-right">
                Kind
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {FILES.map(([path, holds, kind]) => (
              <TableRow key={path}>
                <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                  <code className="text-[13.5px]">{path}</code>
                </th>
                <TableCell className="py-2.5 pr-4 text-[14px] text-ink-soft">{holds}</TableCell>
                <TableCell className="py-2.5 text-right text-[13.5px] text-ink-soft">
                  {kind}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <SourceNote kind="modelled">
          Household rows are calibrated synthetic. NISR and AFR release row-level data for analysis,
          not redistribution, so no microdata extract is committed.
        </SourceNote>
      </section>

      <section className="mt-14" aria-label="Deeper documentation">
        <SectionHeading module="04" title="Deeper documentation" />
        <ul className="grid gap-3 sm:grid-cols-2">
          {[
            ["DATA_SOURCES.md", "Every input, its publisher, its table and its licence"],
            ["DATA_DICTIONARY.md", "Column-level contract for households.csv and the processed JSON"],
            ["METHODOLOGY.md", "Formulas, calibration, the measured-vs-modelled boundary, the EICV7 swap"],
            ["TRACEABILITY.md", "Each rubric criterion mapped to the code and the test that proves it"],
          ].map(([name, what]) => (
            <li key={name} className="border-l-2 border-line pl-3">
              <a
                className="font-medium text-primary-deep underline underline-offset-2"
                href={`${REPO}/docs/${name}`}
                target="_blank"
                rel="noreferrer"
              >
                {name}
              </a>
              <p className="mt-1 text-[14px] leading-snug text-ink-soft">{what}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[14px] text-ink-soft">
          The synthetic layer is compared against these sources figure by figure on{" "}
          <a className="font-medium text-primary-deep underline underline-offset-2" href="/proof">
            the proof page
          </a>
          .
        </p>
      </section>
    </div>
  );
}
