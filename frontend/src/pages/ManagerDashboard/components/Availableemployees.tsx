import React from "react";
import { Search, UserRound } from "lucide-react";

type Employee = {
  _id: string;
  firstName: string;
  lastName: string;
  employeeCode?: string;
  department?: string;
};

const AvailableEmployees: React.FC<{ members?: Employee[]; loading?: boolean }> = ({ members = [], loading = false }) => {
  const [query, setQuery] = React.useState("");

  const filteredEmployees = members.filter((member) => {
    const name = `${member.firstName ?? ""} ${member.lastName ?? ""}`.trim();
    const text = `${name} ${member.department ?? ""} ${member.employeeCode ?? ""}`.toLowerCase();
    return text.includes(query.toLowerCase());
  });

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <UserRound size={20} className="text-[#10284A]" />
        <h3 className="text-lg font-semibold text-[#10284A]">
          Team Members
        </h3>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5">
        <Search size={16} className="text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search employee..."
          className="w-full bg-transparent text-sm text-gray-600 outline-none placeholder:text-gray-400"
        />
      </div>

      <div className="mt-3 divide-y divide-gray-100">
        {loading ? (
          <div className="py-4 text-sm text-gray-400">Loading members…</div>
        ) : filteredEmployees.length === 0 ? (
          <div className="py-4 text-sm text-gray-400">No team members found.</div>
        ) : (
          filteredEmployees.map((emp) => {
            const name = `${emp.firstName} ${emp.lastName}`.trim();
            return (
              <div key={emp._id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50">
                    <UserRound size={20} className="text-[#2459A6]" />
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-[#10284A]">{name}</p>
                    <p className="text-xs text-gray-500">{emp.department || "Team Member"}</p>
                  </div>
                </div>

                <span className="text-xs font-medium text-green-600">Active</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};

export default AvailableEmployees;
