"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { siteConfig } from "@/config/site";

export function Story() {
  const [selectedImage, setSelectedImage] = useState<number | null>(null);

  return (
    <section className="py-16 px-4 bg-romantic-bg">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          className="text-3xl md:text-4xl font-serif text-romantic-pink text-center mb-16"
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          我们的故事
        </motion.h2>

        <div className="relative">
          <div className="absolute left-1/2 transform -translate-x-1/2 h-full w-0.5 bg-romantic-pink-soft hidden md:block"></div>

          <div className="space-y-12">
            {siteConfig.story.map((item, index) => (
              <motion.div
                key={index}
                className={`flex flex-col md:flex-row items-center ${
                  index % 2 === 0 ? "md:flex-row-reverse" : ""
                }`}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
              >
                <div className="md:w-1/2 mb-6 md:mb-0 md:px-8 text-center md:text-left">
                  <div className="inline-block px-4 py-1 bg-romantic-pink-soft text-romantic-pink rounded-full text-sm font-medium mb-2">
                    {item.date}
                  </div>
                  <h3 className="text-xl font-serif text-romantic-text mb-3">
                    {item.title}
                  </h3>
                  <p className="text-romantic-text-soft">{item.description}</p>
                </div>

                <div className="md:w-1/2 flex justify-center">
                  <div className="relative">
                    <motion.div
                      className="w-64 h-64 md:w-80 md:h-80 rounded-xl overflow-hidden shadow-lg cursor-pointer border-4 border-white"
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedImage(index)}
                    >
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    </motion.div>
                    <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-romantic-pink flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          className="mt-24"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <h3 className="text-2xl font-serif text-romantic-text text-center mb-10">
            美好回忆
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {siteConfig.photos.map((photo, index) => (
              <motion.div
                key={index}
                className="aspect-square rounded-xl overflow-hidden shadow-md cursor-pointer"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedImage(index + siteConfig.story.length)}
              >
                <img
                  src={photo}
                  alt={`美好回忆 ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {selectedImage !== null && (
          <motion.div
            className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="relative max-w-4xl w-full">
              <button
                className="absolute top-4 right-4 text-white z-10 p-2 rounded-full hover:bg-white hover:bg-opacity-20 transition-colors"
                onClick={() => setSelectedImage(null)}
              >
                <svg
                  className="w-8 h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
              <img
                src={
                  selectedImage < siteConfig.story.length
                    ? siteConfig.story[selectedImage].image
                    : siteConfig.photos[selectedImage - siteConfig.story.length]
                }
                alt="查看图片"
                className="max-h-[80vh] w-auto mx-auto object-contain"
              />
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}