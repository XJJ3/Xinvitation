"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

interface GuestbookEntry {
  id: string;
  name: string;
  message: string;
  createdAt: string;
}

export function Guestbook() {
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [newEntry, setNewEntry] = useState({ name: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"success" | "error" | null>(null);

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    try {
      const response = await fetch("/api/guestbook");
      if (response.ok) {
        const data = await response.json();
        setEntries(data.entries ?? []);
      }
    } catch (error) {
      console.error("获取留言失败:", error);
    }
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setNewEntry((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      const response = await fetch("/api/guestbook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newEntry),
      });

      if (response.ok) {
        setSubmitStatus("success");
        setNewEntry({ name: "", message: "" });
        fetchEntries();
      } else {
        setSubmitStatus("error");
      }
    } catch (error) {
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="py-16 px-4 bg-romantic-bg-soft">
      <div className="max-w-4xl mx-auto">
        <motion.h2
          className="text-3xl md:text-4xl font-serif text-romantic-pink text-center mb-16"
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          留言祝福
        </motion.h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h3 className="text-xl font-serif text-romantic-text mb-6">留下祝福</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-romantic-text mb-2">
                  姓名 *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={newEntry.name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 border border-romantic-pink-soft rounded-lg focus:outline-none focus:ring-2 focus:ring-romantic-pink"
                  placeholder="请输入您的姓名"
                />
              </div>
              <div>
                <label htmlFor="message" className="block text-romantic-text mb-2">
                  祝福语 *
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={newEntry.message}
                  onChange={handleInputChange}
                  required
                  rows={4}
                  className="w-full px-4 py-3 border border-romantic-pink-soft rounded-lg focus:outline-none focus:ring-2 focus:ring-romantic-pink"
                  placeholder="送上您的祝福..."
                ></textarea>
              </div>
              <div>
                <motion.button
                  type="submit"
                  className="bg-romantic-pink text-white py-3 px-6 rounded-lg font-medium hover:bg-romantic-pink-dark transition-colors disabled:opacity-50"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "提交中..." : "提交祝福"}
                </motion.button>
              </div>
              {submitStatus === "success" && (
                <motion.div
                  className="p-3 bg-green-100 text-green-700 rounded-lg"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  祝福提交成功!
                </motion.div>
              )}
              {submitStatus === "error" && (
                <motion.div
                  className="p-3 bg-red-100 text-red-700 rounded-lg"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  提交失败,请稍后重试。
                </motion.div>
              )}
            </form>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h3 className="text-xl font-serif text-romantic-text mb-6">祝福墙</h3>
            <div className="space-y-6 max-h-96 overflow-y-auto pr-2">
              {entries.length > 0 ? (
                entries.map((entry) => (
                  <motion.div
                    key={entry.id}
                    className="bg-white p-5 rounded-xl shadow-sm border border-romantic-pink-soft"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-medium text-romantic-text">{entry.name}</h4>
                      <span className="text-sm text-romantic-text-soft">
                        {new Date(entry.createdAt).toLocaleDateString("zh-CN")}
                      </span>
                    </div>
                    <p className="text-romantic-text-soft">{entry.message}</p>
                  </motion.div>
                ))
              ) : (
                <p className="text-romantic-text-soft text-center py-8">
                  还没有祝福,快来留下您的祝福吧!
                </p>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}