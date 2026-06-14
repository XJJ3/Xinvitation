"use client";

import { useState } from "react";
import { motion } from "framer-motion";

export function Rsvp() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    attending: "yes",
    guests: "1",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"success" | "error" | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      const response = await fetch("/api/rsvp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setSubmitStatus("success");
        setFormData({
          name: "",
          email: "",
          attending: "yes",
          guests: "1",
          message: "",
        });
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
    <section className="py-16 px-4 bg-romantic-bg">
      <div className="max-w-2xl mx-auto">
        <motion.h2
          className="text-3xl md:text-4xl font-serif text-romantic-pink text-center mb-16"
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          RSVP
        </motion.h2>

        <motion.form
          className="space-y-6"
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div>
            <label htmlFor="name" className="block text-romantic-text mb-2">
              姓名 *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 border border-romantic-pink-soft rounded-lg focus:outline-none focus:ring-2 focus:ring-romantic-pink"
              placeholder="请输入您的姓名"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-romantic-text mb-2">
              邮箱(选填)
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-romantic-pink-soft rounded-lg focus:outline-none focus:ring-2 focus:ring-romantic-pink"
              placeholder="请输入您的邮箱(可不填)"
            />
          </div>

          <div>
            <label className="block text-romantic-text mb-2">
              您能参加吗? *
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="attending"
                  value="yes"
                  checked={formData.attending === "yes"}
                  onChange={handleChange}
                  className="mr-2 h-5 w-5 text-romantic-pink"
                />
                <span className="text-romantic-text">能参加</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="attending"
                  value="no"
                  checked={formData.attending === "no"}
                  onChange={handleChange}
                  className="mr-2 h-5 w-5 text-romantic-pink"
                />
                <span className="text-romantic-text">无法参加</span>
              </label>
            </div>
          </div>

          {formData.attending === "yes" && (
            <div>
              <label htmlFor="guests" className="block text-romantic-text mb-2">
                参加人数 *
              </label>
              <select
                id="guests"
                name="guests"
                value={formData.guests}
                onChange={handleChange}
                required
                className="w-full px-4 py-3 border border-romantic-pink-soft rounded-lg focus:outline-none focus:ring-2 focus:ring-romantic-pink"
              >
                {[1, 2, 3, 4, 5].map((num) => (
                  <option key={num} value={num.toString()}>
                    {num} 人
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="message" className="block text-romantic-text mb-2">
              留言
            </label>
            <textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleChange}
              rows={4}
              className="w-full px-4 py-3 border border-romantic-pink-soft rounded-lg focus:outline-none focus:ring-2 focus:ring-romantic-pink"
              placeholder="送上您的祝福或任何想说的话..."
            ></textarea>
          </div>

          <div>
            <motion.button
              type="submit"
              className="w-full bg-romantic-pink text-white py-3 px-6 rounded-lg font-medium hover:bg-romantic-pink-dark transition-colors disabled:opacity-50"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={isSubmitting}
            >
              {isSubmitting ? "提交中..." : "提交 RSVP"}
            </motion.button>
          </div>

          {submitStatus === "success" && (
            <motion.div
              className="p-4 bg-green-100 text-green-700 rounded-lg"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              感谢您的回复!我们已收到您的 RSVP 信息。
            </motion.div>
          )}

          {submitStatus === "error" && (
            <motion.div
              className="p-4 bg-red-100 text-red-700 rounded-lg"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              提交失败,请稍后重试。
            </motion.div>
          )}
        </motion.form>
      </div>
    </section>
  );
}