import React from "react";
import { Clock } from "lucide-react";

type QueryItem = {
  title: string;
  from: string;
  dept: string;
};

const QueriesList: React.FC = () => {
  const queries: QueryItem[] = [
    { title: "Red looking Add icon misaligned", from: "JD", dept: "Dev" },
    { title: "API response delay on login", from: "Priya", dept: "Dev" },
    { title: "Landing page logo not visible", from: "Sarah", dept: "UI/UX" },
    { title: "Course content font size issue", from: "Lolli", dept: "QA" },
  ];

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={20} className="text-[#10284A]" />
          <h3 className="text-lg font-semibold text-[#10284A]">Queries</h3>
        </div>

        <div className="hidden gap-16 pr-2 text-sm font-medium text-gray-400 sm:flex">
          <span>From</span>
          <span>Dept</span>
        </div>
      </div>

      <div className="mt-4 divide-y divide-gray-100">
        {queries.map((q, idx) => (
          <div
            key={q.title}
            className="flex items-center justify-between gap-4 py-3.5"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-[#2459A6]">
                {idx + 1}
              </span>
              <p className="text-sm font-medium text-[#10284A]">{q.title}</p>
            </div>

            <div className="flex shrink-0 items-center gap-10 text-sm text-gray-500">
              <span className="w-14 text-right sm:w-auto">{q.from}</span>
              <span className="w-10 text-right">{q.dept}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default QueriesList;