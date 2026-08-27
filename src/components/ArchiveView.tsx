import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, RefreshCw, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ChatPanel } from "@/components/ChatPanel";
import { LetterCard } from "@/components/LetterCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listLetters, listOffices, refreshCatalog, type LetterRow } from "@/lib/letters.functions";

type Kind = "warning" | "untitled";
type Sort = "newest" | "oldest" | "company";

const PAGE_SIZE = 20;

export function ArchiveView({
  kind,
  title,
  description,
}: {
  kind: Kind;
  title: string;
  description: string;
}) {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [office, setOffice] = useState("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(0);
  const [activeLetter, setActiveLetter] = useState<LetterRow | null>(null);

  const lettersQuery = useQuery({
    queryKey: ["letters", kind, search, office, sort, page],
    queryFn: () =>
      listLetters({
        data: {
          kind,
          search,
          office: office === "all" ? "" : office,
          sort,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
  });

  const officesQuery = useQuery({
    queryKey: ["offices", kind],
    queryFn: () => listOffices({ data: { kind } }),
  });

  const refresh = useMutation({
    mutationFn: () => refreshCatalog({ data: { kinds: [kind], mode: "incremental" } }),
    onSuccess: (result) => {
      if (!result.ok) toast.info(result.message ?? "Refresh already running.");
      else
        toast.success(
          `Catalog refreshed — ${result.inserted} new, ${result.scanned} scanned.`,
        );
      void queryClient.invalidateQueries({ queryKey: ["letters", kind] });
    },
    onError: () => toast.error("Refresh failed. Please try again."),
  });

  const total = lettersQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <header className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => refresh.mutate()} disabled={refresh.isPending}>
            {refresh.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-4 w-4" />
            )}
            Refresh catalog
          </Button>
        </div>
      </header>

      <form
        className="clinical-panel mt-5 flex flex-wrap items-center gap-2 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          setSearch(searchInput.trim());
        }}
      >
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search company, subject or office…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>

        <Select
          value={office}
          onValueChange={(value) => {
            setOffice(value);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="All issuing offices" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All issuing offices</SelectItem>
            {(officesQuery.data?.offices ?? []).map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sort}
          onValueChange={(value) => {
            setSort(value as Sort);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="company">Company A–Z</SelectItem>
          </SelectContent>
        </Select>

        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <p className="mt-3 text-xs text-muted-foreground">
        {lettersQuery.isPending ? "Loading…" : `${total.toLocaleString()} letters`}
      </p>

      <div className="mt-3 space-y-3">
        {lettersQuery.isPending && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {lettersQuery.isError && (
          <p className="py-10 text-center text-sm text-destructive">
            Could not load letters. Try refreshing the catalog.
          </p>
        )}
        {lettersQuery.data?.letters.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No letters found. Use “Refresh catalog” to pull the latest from FDA.gov.
          </p>
        )}
        {lettersQuery.data?.letters.map((letter) => (
          <LetterCard key={letter.id} letter={letter} onAsk={setActiveLetter} />
        ))}
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <ChatPanel
        open={activeLetter !== null}
        onOpenChange={(open) => !open && setActiveLetter(null)}
        title={activeLetter?.company_name ?? ""}
        subtitle="Scoped to this letter and its response, close-out and promotional documents."
        letterId={activeLetter?.id ?? null}
        kind={kind}
      />
    </div>
  );
}
