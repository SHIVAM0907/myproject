import React, { useState } from "react";
import { Paperclip } from "lucide-react";

const QueryReviewForm: React.FC = () => {
  const [taskId, setTaskId] = useState("");
  const [task, setTask] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [review, setReview] = useState("");
  const [fileName, setFileName] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileName(e.target.files?.[0]?.name || "");
  };

  const handleSubmit = () => {
    // Wire this up to your queries API
    console.log({ taskId, task, query, from, review, fileName });
  };

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-[#10284A]">Queries:</h3>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <input
          type="text"
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
          placeholder="Task ID:"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-[#2459A6]"
        />

        <input
          type="text"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Task:"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-[#2459A6]"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1.6fr_1fr]">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Query:"
          rows={3}
          className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-[#2459A6]"
        />

        <input
          type="text"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="From:"
          className="h-fit w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-[#2459A6]"
        />
      </div>

      <div className="relative mt-4">
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          placeholder="Write review:"
          rows={4}
          className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 pb-12 text-sm text-gray-700 outline-none placeholder:text-gray-400 focus:border-[#2459A6]"
        />

        <label className="absolute bottom-3 right-3 flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-[#2459A6] transition hover:bg-gray-50">
          <Paperclip size={14} />
          Attach file
          <input type="file" onChange={handleFileChange} className="hidden" />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3">
        <span className="text-sm text-gray-400">
          {fileName ? fileName : "File:"}
        </span>

        <button
          type="button"
          onClick={handleSubmit}
          className="ml-auto rounded-xl bg-[#2459A6] px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1e4a8c]"
        >
          Submit
        </button>
      </div>
    </section>
  );
};

export default QueryReviewForm;