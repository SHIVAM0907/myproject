import React from "react";
import { Clock, ChevronRight } from "lucide-react";

type Status = "Resolved" | "In review" | "Open" | "Raised again";

type QueryRow = {
  query: string;
  task: string;
  from: string;
  date: string;
  status: Status;
};

const AllQueriesTable: React.FC = () => {
  const rows: QueryRow[] = [
    { query: "Red lettering add", task: "Header color", from: "JD", date: "19.08.26", status: "Resolved" },
    { query: "Logo not visible", task: "Landing page", from: "Sarah", date: "18.08.26", status: "In review" },
    { query: "Incorrect description", task: "Course content", from: "Amit", date: "17.08.26", status: "Open" },
    { query: "Font size issue", task: "UI Design", from: "Priya", date: "16.08.26", status: "Resolved" },
    { query: "Broken link", task: "Resources", from: "Rohan", date: "14.08.26", status: "Open" },
    { query: "Image not loading", task: "Media", from: "Neha", date: "12.08.26", status: "Resolved" },
    { query: "Wrong text", task: "About us page", from: "Karan", date: "10.08.26", status: "In review" },
    { query: "Feature request", task: "Dashboard", from: "Sneha", date: "08.08.26", status: "Raised again" },
  ];

  const statusStyles: Record<Status, string> = {
    Resolved: "bg-green-50 text-green-600",
    "In review": "bg-blue-50 text-blue-600",
    Open: "bg-rose-50 text-rose-500",
    "Raised again": "bg-rose-50 text-rose-500",
  };

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={20} className="text-[#10284A]" />
          <h3 className="text-lg font-semibold text-[#10284A]">
            All queries
          </h3>
        </div>

        <button className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2459A6] text-white shadow-sm transition hover:bg-[#1e4a8c]">
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs font-medium text-gray-400">
              <th className="pb-3 pr-4 font-medium">Query</th>
              <th className="pb-3 pr-4 font-medium">Task</th>
              <th className="pb-3 pr-4 font-medium">From</th>
              <th className="pb-3 pr-4 font-medium">Date</th>
              <th className="pb-3 pr-4 font-medium">Status</th>
              <th className="pb-3 font-medium">View more</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.query} className="text-sm">
                <td className="py-3.5 pr-4 text-gray-700">{row.query}</td>
                <td className="py-3.5 pr-4 text-gray-600">{row.task}</td>
                <td className="py-3.5 pr-4 text-gray-600">{row.from}</td>
                <td className="py-3.5 pr-4 text-gray-500">{row.date}</td>

                <td className="py-3.5 pr-4">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      statusStyles[row.status]
                    }`}
                  >
                    {row.status}
                  </span>
                </td>

                <td className="py-3.5">
                  <button className="text-sm font-medium text-[#2459A6] hover:underline">
                    View more →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default AllQueriesTable;