import React from "react";
import { Link } from "react-router-dom";
import logo from "../../assets/logo2.png";

type Feature = {
  title: string;
  body: string;
  accent: string;
};

const FEATURES: Feature[] = [
  {
    title: "Attendance, without the paperwork",
    body: "Check in and out, log breaks, and watch the month build itself. Late arrivals and half-days are recorded as they happen.",
    accent: "#0E9F8B",
  },
  {
    title: "Leave that tracks itself",
    body: "Casual, sick, earned or unpaid — balances are deducted on approval and every request keeps its own history.",
    accent: "#6A55D6",
  },
  {
    title: "Tasks with real owners",
    body: "See what is assigned to you and where each item stands, from Not Started through to Completed.",
    accent: "#E2A100",
  },
  {
    title: "Raise a query in seconds",
    body: "Send a question to your manager and follow it from open to resolved without chasing anyone over chat.",
    accent: "#E4484D",
  },
  {
    title: "Meetings that stay on record",
    body: "Schedule, start and end meetings, with attendance and notes captured against the people who were there.",
    accent: "#6A55D6",
  },
  {
    title: "Your team at a glance",
    body: "Managers get attendance rates, leave approvals and task rollups for the whole team in one view.",
    accent: "#0E9F8B",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Create your account",
    body: "Register with your work email. An administrator approves it, usually the same day.",
  },
  {
    step: "02",
    title: "Sign in",
    body: "One login for everyone. Managers land on the team console, everyone else on their dashboard.",
  },
  {
    step: "03",
    title: "Get to work",
    body: "Check in, pick up your tasks, request leave and raise queries without leaving the app.",
  },
];

/**
 * Public landing page. Every dashboard screen is behind auth, so `/` used to
 * bounce straight to /employee; this is now the front door, with /login and
 * /signup alongside it.
 */
const Home: React.FC = () => (
  <div className="min-h-screen bg-[#EDF0F3] text-[#121C2B]">
    <header className="sticky top-0 z-20 border-b border-[#DCE2E8] bg-[#EDF0F3]/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1240px] items-center gap-4 px-5 py-4">
        <Link to="/" className="flex items-center">
          <img src={logo} alt="Work Flow" className="h-8 w-auto object-contain" />
        </Link>

        <nav aria-label="Primary" className="ml-auto flex items-center gap-2">
          <a
            href="#features"
            className="hidden rounded-full px-4 py-1.5 text-sm font-medium text-[#667385] transition hover:text-[#121C2B] sm:block"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="hidden rounded-full px-4 py-1.5 text-sm font-medium text-[#667385] transition hover:text-[#121C2B] sm:block"
          >
            How it works
          </a>
          <Link
            to="/login"
            className="rounded-full border border-[#DCE2E8] bg-white px-4 py-1.5 text-sm font-medium transition hover:border-[#121C2B]"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="rounded-full bg-[#121C2B] px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[#26364d]"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>

    <main>
      {/* ------------------------------------------------------------- hero */}
      <section className="mx-auto max-w-[1240px] px-5 pb-16 pt-14 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#DCE2E8] bg-white px-3.5 py-1.5 text-xs font-medium text-[#667385]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0E9F8B]" />
              One place for the whole workday
            </span>

            <h1 className="mt-6 font-['Bricolage_Grotesque',sans-serif] text-4xl font-bold leading-[1.08] sm:text-5xl lg:text-[3.5rem]">
              Attendance, leave and tasks
              <br />
              <span className="text-[#6A55D6]">that keep themselves.</span>
            </h1>

            <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-[#667385]">
              Work Flow gives your team a single place to check in, request leave, pick up
              assigned work and raise queries — with managers seeing the whole picture at once.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/signup"
                className="rounded-xl bg-[#121C2B] px-6 py-3 text-sm font-medium text-white transition hover:bg-[#26364d]"
              >
                Create your account
              </Link>
              <Link
                to="/login"
                className="rounded-xl border border-[#DCE2E8] bg-white px-6 py-3 text-sm font-medium transition hover:border-[#121C2B]"
              >
                Sign in
              </Link>
            </div>

            <p className="mt-4 text-xs text-[#667385]">
              New accounts are reviewed by an administrator before first sign-in.
            </p>
          </div>

          {/* A static preview of the dashboard, so the product is visible
              before anyone commits to an account. */}
          <div className="rounded-[18px] border border-[#DCE2E8] bg-white p-5 shadow-[0_1px_2px_rgba(18,28,43,0.04)]">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-[#EDF0F3]" />
              <div>
                <p className="text-sm font-medium">Today</p>
                <p className="text-xs text-[#667385]">Checked in at 09:04</p>
              </div>
              <span className="ml-auto rounded-full bg-[#0E9F8B]/10 px-3 py-1 text-xs font-medium text-[#0E9F8B]">
                Present
              </span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { label: "Leave left", value: "12", tone: "#6A55D6" },
                { label: "Tasks", value: "7", tone: "#E2A100" },
                { label: "Queries", value: "2", tone: "#E4484D" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-[#DCE2E8] p-3">
                  <p className="text-xs text-[#667385]">{stat.label}</p>
                  <p
                    className="mt-1 font-['Bricolage_Grotesque',sans-serif] text-2xl font-bold"
                    style={{ color: stat.tone }}
                  >
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-2">
              {[
                { title: "Prepare the quarterly review", state: "In Progress" },
                { title: "Update onboarding docs", state: "Not Started" },
                { title: "Ship attendance export", state: "Completed" },
              ].map((row) => (
                <div
                  key={row.title}
                  className="flex items-center gap-3 rounded-xl border border-[#DCE2E8] px-3.5 py-2.5"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#6A55D6]" />
                  <p className="truncate text-sm">{row.title}</p>
                  <span className="ml-auto shrink-0 text-xs text-[#667385]">{row.state}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- features */}
      <section id="features" className="scroll-mt-20 border-t border-[#DCE2E8] bg-white py-16">
        <div className="mx-auto max-w-[1240px] px-5">
          <h2 className="font-['Bricolage_Grotesque',sans-serif] text-3xl font-bold">
            Everything the workday needs
          </h2>
          <p className="mt-2 max-w-[52ch] text-[#667385]">
            Six tools that used to live in spreadsheets, chat threads and someone's memory.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <article
                key={feature.title}
                className="rounded-[18px] border border-[#DCE2E8] bg-white p-5 transition hover:border-[#B9C3CF]"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: feature.accent }}
                  aria-hidden="true"
                />
                <h3 className="mt-4 font-['Bricolage_Grotesque',sans-serif] text-lg font-bold">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#667385]">{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ how it works */}
      <section id="how-it-works" className="scroll-mt-20 py-16">
        <div className="mx-auto max-w-[1240px] px-5">
          <h2 className="font-['Bricolage_Grotesque',sans-serif] text-3xl font-bold">
            Up and running in three steps
          </h2>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((item) => (
              <div key={item.step} className="rounded-[18px] border border-[#DCE2E8] bg-white p-5">
                <p className="font-['Bricolage_Grotesque',sans-serif] text-sm font-bold text-[#6A55D6]">
                  {item.step}
                </p>
                <h3 className="mt-3 font-['Bricolage_Grotesque',sans-serif] text-lg font-bold">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#667385]">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- closing */}
      <section className="mx-auto max-w-[1240px] px-5 pb-20">
        <div className="rounded-[18px] bg-[#121C2B] p-8 text-center sm:p-12">
          <h2 className="font-['Bricolage_Grotesque',sans-serif] text-3xl font-bold text-white">
            Give your team a calmer week
          </h2>
          <p className="mx-auto mt-3 max-w-[46ch] text-sm leading-relaxed text-white/70">
            Register with your work email and an administrator will have you approved shortly.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              to="/signup"
              className="rounded-xl bg-white px-6 py-3 text-sm font-medium text-[#121C2B] transition hover:bg-[#EDF0F3]"
            >
              Create your account
            </Link>
            <Link
              to="/login"
              className="rounded-xl border border-white/25 px-6 py-3 text-sm font-medium text-white transition hover:border-white/60"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </main>

    <footer className="border-t border-[#DCE2E8] bg-white">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-5 py-8 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <img src={logo} alt="" className="h-7 w-auto object-contain" />
          <p className="text-sm font-medium">Work Flow</p>
        </div>
        <nav aria-label="Footer" className="flex gap-5 sm:ml-auto text-sm text-[#667385]">
          <Link to="/login" className="transition hover:text-[#121C2B]">
            Sign in
          </Link>
          <Link to="/signup" className="transition hover:text-[#121C2B]">
            Create account
          </Link>
          <a href="#features" className="transition hover:text-[#121C2B]">
            Features
          </a>
          <Link to="/admin/login" className="transition hover:text-[#121C2B]">
            Admin
          </Link>
        </nav>
        <p className="text-xs text-[#667385] sm:text-right">
          &copy; {new Date().getFullYear()} Work Flow
        </p>
      </div>
    </footer>
  </div>
);

export default Home;