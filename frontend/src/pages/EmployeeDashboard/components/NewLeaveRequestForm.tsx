import React, { useEffect, useState } from "react";
import { FileText, Paperclip, ChevronDown } from "lucide-react";
import employeeApi from "../../../lib/employeeApi";

const leaveTypes = [
  { value: "casual", label: "Casual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "earned", label: "Earned Leave" },
  { value: "unpaid", label: "Unpaid Leave" },
];
const dayTypes = [
  { value: "full_day", label: "Full Day" },
  { value: "first_half", label: "First Half" },
  { value: "second_half", label: "Second Half" },
];

const NewLeaveRequestForm: React.FC = () => {
  const [leaveType, setLeaveType] = useState("casual");
  const [reportingManager, setReportingManager] = useState("Reporting Manager");
  const [fromDate, setFromDate] = useState("2026-09-22");
  const [toDate, setToDate] = useState("2026-09-23");
  const [dayType, setDayType] = useState("full_day");
  const [contact, setContact] = useState("");
  const [reason, setReason] = useState("");
  const [fileName, setFileName] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successText, setSuccessText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    employeeApi
      .get("/me")
      .then((res) => {
        const employee = res.data?.employee;
        const manager = employee?.manager;
        if (manager && typeof manager === "object") {
          setReportingManager(`${manager.firstName ?? ""} ${manager.lastName ?? ""}`.trim() || "Reporting Manager");
        }
      })
      .catch(() => {
        setReportingManager("Reporting Manager");
      });
  }, []);

  const durationDays =
    fromDate && toDate
      ? Math.max(
          1,
          Math.round(
            (new Date(toDate).getTime() - new Date(fromDate).getTime()) /
              (1000 * 60 * 60 * 24)
          ) + 1
        )
      : 0;

  const formatShort = (dateStr: string) =>
    dateStr
      ? new Date(dateStr).toLocaleDateString("en-US", {
          day: "2-digit",
          month: "short",
        })
      : "";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileName(e.target.files?.[0]?.name || "");
  };

  const submitLeave = async (mode: "submit" | "draft") => {
    if (!fromDate || !toDate || !reason.trim()) {
      setSubmitError("From date, to date, and reason are required.");
      setSuccessText(null);
      return;
    }

    setSaving(true);
    setSubmitError(null);
    setSuccessText(null);

    try {
      const payload = {
        leaveType,
        fromDate,
        toDate,
        dayType,
        reason,
        contactWhileOnLeave: contact,
        attachments: fileName ? [fileName] : [],
      };

      const endpoint = mode === "submit" ? "/leave" : "/leave/draft";
      await employeeApi.post(endpoint, payload);
      setSuccessText(mode === "submit" ? "Leave request submitted successfully." : "Leave draft saved successfully.");
    } catch (error: any) {
      setSubmitError(error.response?.data?.message || "Could not save leave request.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = () => submitLeave("submit");
  const handleSaveDraft = () => submitLeave("draft");

  const fieldInput =
    "mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-[#2459A6]";
  const labelCls = "text-[13px] font-medium text-[#10284A]";

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <FileText size={20} className="text-[#10284A]" />
        <h3 className="text-lg font-semibold text-[#10284A]">New Leave Request</h3>
      </div>
      <p className="mt-0.5 text-xs text-gray-500">
        Requests are sent to your reporting manager for approval.
      </p>

      {submitError && <p className="mt-2 text-sm text-rose-600">{submitError}</p>}
      {successText && <p className="mt-2 text-sm text-emerald-600">{successText}</p>}

      {/* 3 columns instead of 2, so the form needs far fewer rows */}
      <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
        <div>
          <label className={labelCls}>
            Leave Type <span className="text-rose-500">*</span>
          </label>
          <div className="relative">
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
              className={`${fieldInput} appearance-none`}
            >
              {leaveTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>
            Reporting Manager <span className="text-rose-500">*</span>
          </label>
          <input value={reportingManager} readOnly className={`${fieldInput} bg-gray-50`} />
        </div>

        <div>
          <label className={labelCls}>Day Type</label>
          <div className="relative">
            <select
              value={dayType}
              onChange={(e) => setDayType(e.target.value)}
              className={`${fieldInput} appearance-none`}
            >
              {dayTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>
            From Date <span className="text-rose-500">*</span>
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={fieldInput}
          />
        </div>

        <div>
          <label className={labelCls}>
            To Date <span className="text-rose-500">*</span>
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={fieldInput}
          />
        </div>

        <div>
          <label className={labelCls}>Contact While on Leave</label>
          <input
            type="text"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Phone or alternate contact"
            className={fieldInput}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={labelCls}>
            Reason <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Briefly describe the reason for your leave..."
            rows={2}
            className={`${fieldInput} resize-none`}
          />
        </div>

        <div>
          <label className={labelCls}>Attachments</label>
          <label className="mt-1.5 flex h-[calc(100%-1.5rem)] min-h-[58px] cursor-pointer items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500 transition hover:bg-gray-50">
            <Paperclip size={16} className="shrink-0" />
            <span className="min-w-0 truncate">{fileName || "Add file (optional, e.g. medical certificate)"}</span>
            <input type="file" onChange={handleFileChange} className="hidden" />
          </label>
        </div>
      </div>

      {/* Duration and actions share one row */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-[#2459A6]">
          {durationDays > 0 && fromDate && toDate && (
            <>
              Duration: {durationDays} day{durationDays > 1 ? "s" : ""} ({formatShort(fromDate)} –{" "}
              {formatShort(toDate)})
            </>
          )}
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveDraft}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
          >
            Save as Draft
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={handleSubmit}
            className="rounded-xl bg-[#2459A6] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1e4a8c] disabled:opacity-60"
          >
            {saving ? "Submitting..." : "Submit Request"}
          </button>
        </div>
      </div>
    </section>
  );
};

export default NewLeaveRequestForm;