import React, { useState } from "react";
import { ClipboardList, Paperclip, Plus, ChevronDown, X } from "lucide-react";
import employeeApi from "../../../lib/employeeApi";
import { uploadApi, uploadPutHeaders } from "../../../lib/uploadApi";

type Member = {
  _id: string;
  firstName: string;
  lastName: string;
  employeeCode?: string;
  department?: string;
};

const AssignTaskForm: React.FC<{ members?: Member[]; onCreated?: () => void }> = ({ members = [], onCreated }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [attachments, setAttachments] = useState<Array<{ name: string; key: string }>>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const priorities = ["Low", "Medium", "High"];

  const uploadFileToStorage = async (file: File) => {
    const { data } = await uploadApi.post("/get-upload-url", {
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      folderMain: "tasks",
      folderSub: "attachments",
    });

    const response = await fetch(data.uploadUrl, {
      method: "PUT",
      body: file,
      headers: uploadPutHeaders(file.type || "application/octet-stream"),
    });

    if (!response.ok) {
      throw new Error(`Upload failed for ${file.name}`);
    }

    return { name: file.name, key: data.key };
  };

  const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setUploadingAttachments(true);
    setError(null);

    try {
      const uploadedFiles = await Promise.all(files.map((file) => uploadFileToStorage(file)));
      setAttachments((prev) => [...prev, ...uploadedFiles]);
    } catch (err: any) {
      console.error("Task attachment upload failed:", err);
      setError(err?.message || "Could not upload attachment(s). Please try again.");
    } finally {
      e.target.value = "";
      setUploadingAttachments(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !assignTo) {
      setError("Please add a title and choose an assignee.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      await employeeApi.post("/tasks", {
        title: title.trim(),
        description: description.trim(),
        assignedTo: assignTo,
        priority,
        status: "Not Started",
        attachments: attachments.map((file) => file.key),
      });
      setSuccess("Task assigned successfully.");
      setTitle("");
      setDescription("");
      setAssignTo("");
      setPriority("Medium");
      setAttachments([]);
      onCreated?.();
    } catch (err: any) {
      setError(err.response?.data?.message || "Could not assign the task.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <ClipboardList size={20} className="text-[#10284A]" />
        <h3 className="text-lg font-semibold text-[#10284A]">Assign Task</h3>
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      {success && <p className="mt-3 text-sm text-emerald-600">{success}</p>}

      <div className="mt-4 grid grid-cols-2 gap-5">
        <div>
          <label className="text-sm font-medium text-[#10284A]">
            Task Title <span className="text-rose-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter task title"
            className="mt-2 w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-[#2459A6]"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-[#10284A]">
            Task Description <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Enter task description..."
            rows={1}
            className="mt-2 w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-[#2459A6]"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-[#10284A]">
            Assign To <span className="text-rose-500">*</span>
          </label>
          <div className="relative mt-2">
            <select
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              className="w-full appearance-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 outline-none focus:border-[#2459A6]"
            >
              <option value="" disabled>
                Select Employee
              </option>
              {members.map((emp) => (
                <option key={emp._id} value={emp._id}>
                  {emp.firstName} {emp.lastName}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-[#10284A]">
            Priority <span className="text-rose-500">*</span>
          </label>
          <div className="relative mt-2">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full appearance-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 outline-none focus:border-[#2459A6]"
            >
              {priorities.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-[#10284A]">
            Attachments
          </label>
          <label className="mt-2 flex w-full cursor-pointer items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-sm text-gray-500 transition hover:bg-gray-50">
            <Paperclip size={16} />
            {uploadingAttachments ? "Uploading..." : attachments.length ? attachments.map((file) => file.name).join(", ") : "Add Files"}
            <input type="file" multiple className="hidden" onChange={handleAttachmentChange} />
          </label>

          {attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {attachments.map((file) => (
                <div
                  key={`${file.key}-${file.name}`}
                  className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-600"
                >
                  <span className="max-w-[160px] truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((item) => item.key !== file.key))}
                    className="text-gray-400 transition hover:text-rose-500"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={submitting || uploadingAttachments}
        onClick={handleSubmit}
        className="mt-5 flex items-center gap-2 rounded-xl bg-[#2459A6] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1e4a8c] disabled:cursor-not-allowed disabled:opacity-70"
      >
        <Plus size={16} />
        {submitting ? "Assigning..." : "Assign Task"}
      </button>
    </section>
  );
};

export default AssignTaskForm;
