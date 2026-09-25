"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

type Citation = { title: string; category: string };
type KnowledgeEntry = { id: number; title: string; category: string };
type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
};

const suggestions = [
  {
    label: "Find my class timetable",
    question: "How do I find my class timetable?",
  },
  {
    label: "Applying for admission",
    question: "What should I know about applying for admission?",
  },
  {
    label: "Exam information & support",
    question: "Where can I find exam information and accommodations?",
  },
  {
    label: "Campus services and facilities",
    question: "What support and facilities are available on campus?",
  },
];

const newId = () => Date.now() + Math.random();
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");

function apiUrl(path: string) {
  return `${API_BASE_URL}${path}`;
}

async function fetchKnowledge(): Promise<KnowledgeEntry[]> {
  const response = await fetch(apiUrl("/api/knowledge"));
  if (!response.ok) throw new Error("Couldn't load university information.");
  return (await response.json()) as KnowledgeEntry[];
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [language, setLanguage] = useState("English");
  const [question, setQuestion] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [openAiReady, setOpenAiReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const categories = Array.from(
    new Set(knowledge.map((item) => item.category)),
  ).sort();

  async function refreshKnowledge() {
    try {
      setKnowledge(await fetchKnowledge());
    } catch {
      setError(
        "Couldn't load university information. Check that the FastAPI service is running.",
      );
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchKnowledge()
      .then((entries) => {
        if (!cancelled) setKnowledge(entries);
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "Couldn't load university information. Check that the FastAPI service is running.",
          );
        }
      });
    fetch(apiUrl("/api/health"))
      .then((response) => response.json())
      .then((status: { openai_configured: boolean }) => {
        if (!cancelled) setOpenAiReady(status.openai_configured);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't connect to the FastAPI service.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending]);

  async function ask(rawQuestion: string) {
    const message = rawQuestion.trim();
    if (!message || isSending) return;
    setError("");
    setQuestion("");
    setMessages((current) => [
      ...current,
      { id: newId(), role: "user", text: message },
    ]);
    setIsSending(true);

    try {
      const response = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, language }),
      });
      const result = (await response.json()) as {
        answer?: string;
        citations?: Citation[];
        detail?: string;
      };
      if (!response.ok)
        throw new Error(
          result.detail || "The assistant couldn't answer right now.",
        );
      setMessages((current) => [
        ...current,
        {
          id: newId(),
          role: "assistant",
          text:
            result.answer || "I couldn't prepare an answer. Please try again.",
          citations: result.citations || [],
        },
      ]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Connection issue. Please try again.",
      );
    } finally {
      setIsSending(false);
      composerRef.current?.focus();
    }
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function addKnowledge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(apiUrl("/api/knowledge"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.get("title"),
          category: form.get("category"),
          content: form.get("content"),
        }),
      });
      const result = (await response.json()) as { detail?: { msg?: string }[] };
      if (!response.ok)
        throw new Error(
          result.detail?.[0]?.msg || "Couldn't add this information.",
        );
      formElement.reset();
      setKnowledgeOpen(false);
      setNotice("Information added to the university knowledge base.");
      window.setTimeout(() => setNotice(""), 3000);
      await refreshKnowledge();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Connection issue. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[254px_minmax(0,1fr)]">
      <aside
        aria-label="Campus Companion navigation"
        className="hidden min-h-screen flex-col bg-[#183d34] px-[17px] py-[27px] text-[#f4f6ee] md:flex"
      >
        <div className="flex items-center gap-[11px] px-2">
          <div className="grid size-9 place-items-center rounded-xl bg-[#e9be69] font-display text-[21px] text-[#183d34]">
            C
          </div>
          <div>
            <div className="font-display text-[19px]">Campus Companion</div>
            <div className="mt-0.5 text-[11px] text-[#a9beb4]">
              Student support, made simple
            </div>
          </div>
        </div>
        <div className="mb-2 ml-[9px] mt-9 text-[10px] font-bold uppercase tracking-[1.2px] text-[#9ab1a6]">
          Workspace
        </div>
        <button
          onClick={() => {
            setMessages([]);
            setError("");
          }}
          className="flex w-full items-center gap-2.5 rounded-lg bg-white/10 px-3 py-[11px] text-left text-sm text-white hover:bg-white/15"
          type="button"
        >
          <span className="text-xl leading-4 text-[#f2c871]">+</span> New
          conversation
        </button>
        <div className="mb-2 ml-[9px] mt-9 text-[10px] font-bold uppercase tracking-[1.2px] text-[#9ab1a6]">
          University topics
        </div>
        <div className="grid gap-[3px]">
          {categories.map((category, index) => (
            <div
              className="flex items-center gap-2.5 px-[11px] py-2 text-[13px] text-[#d2e0d7]"
              key={category}
            >
              <span
                className={`size-[7px] rounded-full ${["bg-[#82b79b]", "bg-[#e8bd6d]", "bg-[#e58a6d]", "bg-[#9db6d0]", "bg-[#c3a4ce]"][index % 5]}`}
              />
              <span>{category}</span>
              <span className="ml-auto text-[11px] text-[#9ab1a6]">
                {knowledge.filter((item) => item.category === category).length}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-auto border-t border-white/10 px-[11px] pb-1 pt-4 text-[11px] leading-relaxed text-[#a9beb4]">
          <span
            className={`mr-1.5 inline-block size-[7px] rounded-full ${openAiReady ? "bg-[#88c49d]" : "bg-[#f0c96f]"}`}
          />
          {openAiReady ? "AI assistant ready" : "Knowledge answers ready"}
          <br />
          Answers are based on university information.
        </div>
      </aside>

      <main className="flex min-h-screen min-w-0 flex-col">
        <header className="flex h-[71px] shrink-0 items-center justify-between border-b border-[#e4eae4] bg-white/75 px-[17px] md:px-[39px] max-md:h-[58px]">
          <div className="flex items-center gap-2 text-[12px] text-[#57675e] md:text-[13px]">
            <span className="grid size-8 place-items-center rounded-[10px] bg-[#e9be69] font-display text-lg text-[#183d34] md:hidden">
              C
            </span>
            <span>
              Student help desk <span aria-hidden="true">/</span>{" "}
              <strong>Ask a question</strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2.5">
            <label className="sr-only" htmlFor="language">
              Answer language
            </label>
            <select
              id="language"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
              className="h-[34px] max-w-[116px] rounded-[7px] border border-[#e4eae4] bg-white px-2 text-xs text-[#20332d] md:h-9 md:px-[11px] md:text-sm"
            >
              <option value="English">English</option>
              <option value="Spanish">Español</option>
              <option value="French">Français</option>
              <option value="Hindi">हिन्दी</option>
            </select>
            <button
              onClick={() => setKnowledgeOpen(true)}
              className="h-[34px] rounded-[7px] border border-[#e4eae4] bg-white px-2 text-xs hover:border-[#b9cbc0] hover:bg-[#f8fbf8] md:h-9 md:px-3 md:text-sm"
              type="button"
            >
              Add information
            </button>
          </div>
        </header>

        <section
          aria-label="Student support chat"
          className="mx-auto flex min-h-[calc(100vh-58px)] w-full max-w-[820px] flex-1 flex-col px-[17px] pb-5 pt-7 md:min-h-[calc(100vh-71px)] md:px-[30px] md:pt-[39px]"
        >
          {messages.length === 0 ? (
            <div className="my-auto mb-[27px] pt-2 md:pt-[22px]">
              <div className="inline-flex items-center gap-[7px] rounded-full border border-[#d7e6da] bg-[#edf5ed] px-[10px] py-[7px] text-[11px] font-semibold text-[#245448]">
                <span className="text-sm text-[#d96e53]" aria-hidden="true">
                  ✳
                </span>{" "}
                YOUR CAMPUS, A LITTLE CLOSER
              </div>
              <h1 className="mb-2.5 mt-[19px] max-w-[620px] font-display text-[36px] font-medium leading-[1.12] text-[#20332d] md:text-[48px]">
                Here for your next question.
              </h1>
              <p className="max-w-[500px] text-sm leading-[1.7] text-[#75817a] md:text-[15px]">
                From your first application to finals week, get a clear starting
                point for the things students need to know.
              </p>
              <div className="mb-2.5 mt-6 text-[11px] font-bold uppercase tracking-[.7px] text-[#65736b]">
                A few places to start
              </div>
              <div className="grid gap-[7px] sm:grid-cols-2 sm:gap-[9px]">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    onClick={() => void ask(suggestion.question)}
                    type="button"
                    className="flex min-h-[47px] items-center justify-between gap-3 rounded-lg border border-[#e1e8e1] bg-white/80 px-[13px] py-[11px] text-left text-[13px] text-[#3c5147] transition hover:-translate-y-px hover:border-[#b7d1bf] hover:shadow-[0_6px_18px_rgba(35,68,54,.06)] sm:min-h-[55px] sm:text-sm"
                  >
                    {suggestion.label}
                    <span
                      className="text-[17px] text-[#d96e53]"
                      aria-hidden="true"
                    >
                      ↗
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mb-5 grid gap-5" aria-live="polite">
              {messages.map((message) => (
                <div
                  className={`flex items-start gap-[11px] ${message.role === "user" ? "justify-end" : ""}`}
                  key={message.id}
                >
                  {message.role === "assistant" && (
                    <div
                      className="grid size-[30px] shrink-0 place-items-center rounded-[10px] bg-[#e3f1e8] font-display text-base text-[#245448]"
                      aria-hidden="true"
                    >
                      C
                    </div>
                  )}
                  <div
                    className={`max-w-[83%] ${message.role === "user" ? "rounded-[12px_12px_3px_12px] bg-[#245448] px-3.5 py-[11px] text-white" : "pt-2 text-[#35473d]"}`}
                  >
                    {message.role === "assistant" && (
                      <div className="mb-[5px] text-[11px] text-[#839087]">
                        Campus Companion
                      </div>
                    )}
                    <div className="whitespace-pre-wrap text-sm leading-[1.75]">
                      {message.text}
                    </div>
                    {!!message.citations?.length && (
                      <div className="mt-[11px] flex flex-wrap gap-1.5">
                        {message.citations.map((citation) => (
                          <span
                            className="rounded-[5px] border border-[#dce8df] bg-[#f3f8f3] px-2 py-[5px] text-[11px] text-[#476455]"
                            key={`${citation.category}-${citation.title}`}
                          >
                            {citation.category} · {citation.title}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isSending && (
                <div className="flex items-start gap-[11px]" role="status">
                  <div className="grid size-[30px] place-items-center rounded-[10px] bg-[#e3f1e8] font-display text-[#245448]">
                    C
                  </div>
                  <div className="pt-2 text-[13px] text-[#7d8b82]">
                    Looking through university information…
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
          )}

          <div className="mt-auto">
            {error && (
              <p
                className="mb-2 rounded-md bg-[#fff0e9] px-3 py-2 text-xs text-[#934b36]"
                role="alert"
              >
                {error}
              </p>
            )}
            <form
              onSubmit={submitQuestion}
              className="flex items-end gap-2.5 rounded-[11px] border border-[#dce5dc] bg-white p-2.5 shadow-[0_18px_60px_rgba(35,68,54,.08)] focus-within:border-[#9bbba5] focus-within:ring-[3px] focus-within:ring-[#5c8f6c]/10"
            >
              <label className="sr-only" htmlFor="question">
                Ask your question
              </label>
              <textarea
                ref={composerRef}
                id="question"
                rows={1}
                maxLength={4000}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={handleComposerKey}
                placeholder="Ask about admissions, courses, exams, campus life..."
                className="max-h-[150px] min-h-[43px] w-full resize-none border-0 bg-transparent px-[9px] py-[11px] text-sm leading-6 text-[#20332d] outline-none placeholder:text-[#9aa59e]"
              />
              <button
                aria-label="Send question"
                title="Send question"
                disabled={isSending}
                className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#d96e53] text-xl text-white hover:bg-[#c95e44] disabled:cursor-wait disabled:opacity-50"
                type="submit"
              >
                ↑
              </button>
            </form>
            <p className="mt-2.5 text-center text-[11px] text-[#8a958d]">
              <span className="text-[#aa674f]">Demo knowledge base.</span>{" "}
              Confirm important dates and policies with your university.
            </p>
          </div>
        </section>
      </main>

      {knowledgeOpen && (
        <div
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setKnowledgeOpen(false);
          }}
          className="fixed inset-0 z-50 grid place-items-center bg-[#182d25]/45 p-5"
        >
          <section
            aria-labelledby="dialog-title"
            aria-modal="true"
            className="max-h-[92vh] w-full max-w-[500px] overflow-auto rounded-[10px] border border-[#e2e9e2] bg-white p-6 shadow-[0_25px_80px_rgba(16,38,29,.2)]"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  className="font-display text-[25px] text-[#20332d]"
                  id="dialog-title"
                >
                  Add university information
                </h2>
                <p className="mb-5 mt-1.5 text-[13px] leading-relaxed text-[#75817a]">
                  Add a verified policy, service detail, or student resource. It
                  will be available to the assistant right away.
                </p>
              </div>
              <button
                onClick={() => setKnowledgeOpen(false)}
                aria-label="Close dialog"
                className="grid size-8 shrink-0 place-items-center rounded-md border border-[#e4eae4] bg-white text-lg"
                type="button"
              >
                ×
              </button>
            </div>
            <form onSubmit={addKnowledge} className="grid gap-3.5">
              <div className="grid gap-1.5">
                <label
                  className="text-xs font-semibold text-[#485a50]"
                  htmlFor="source-title"
                >
                  Title
                </label>
                <input
                  className="rounded-md border border-[#dce5dc] px-[11px] py-2.5 text-sm outline-none focus:border-[#91b39a] focus:ring-2 focus:ring-[#5c8f6c]/10"
                  id="source-title"
                  name="title"
                  maxLength={160}
                  minLength={2}
                  placeholder="e.g. Fall registration dates"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <label
                  className="text-xs font-semibold text-[#485a50]"
                  htmlFor="source-category"
                >
                  Topic
                </label>
                <input
                  className="rounded-md border border-[#dce5dc] px-[11px] py-2.5 text-sm outline-none focus:border-[#91b39a] focus:ring-2 focus:ring-[#5c8f6c]/10"
                  id="source-category"
                  name="category"
                  maxLength={80}
                  minLength={2}
                  placeholder="e.g. Courses"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <label
                  className="text-xs font-semibold text-[#485a50]"
                  htmlFor="source-content"
                >
                  University information
                </label>
                <textarea
                  className="min-h-[125px] resize-y rounded-md border border-[#dce5dc] px-[11px] py-2.5 text-sm leading-6 outline-none focus:border-[#91b39a] focus:ring-2 focus:ring-[#5c8f6c]/10"
                  id="source-content"
                  name="content"
                  maxLength={10000}
                  minLength={10}
                  placeholder="Enter the verified information students should receive."
                  required
                />
              </div>
              {error && (
                <p className="text-xs text-[#934b36]" role="alert">
                  {error}
                </p>
              )}
              <div className="mt-1 flex justify-end gap-2">
                <button
                  onClick={() => setKnowledgeOpen(false)}
                  className="h-[38px] rounded-md border border-[#e4eae4] bg-white px-3 text-sm"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  disabled={isSaving}
                  className="h-[38px] rounded-md bg-[#245448] px-3.5 text-sm font-semibold text-white hover:bg-[#183d34] disabled:opacity-50"
                  type="submit"
                >
                  {isSaving ? "Adding…" : "Add to knowledge base"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {notice && (
        <div
          className="fixed bottom-5 right-[22px] z-[60] max-w-[calc(100vw-44px)] rounded-md bg-[#183d34] px-4 py-3 text-sm text-white shadow-lg"
          role="status"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
