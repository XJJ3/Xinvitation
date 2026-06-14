"use client";

import { motion } from "framer-motion";
import { siteConfig } from "@/config/site";

export function Venue() {
  return (
    <section className="py-16 px-4 bg-romantic-bg-soft">
      <div className="max-w-6xl mx-auto">
        <motion.h2
          className="text-3xl md:text-4xl font-serif text-romantic-pink text-center mb-16"
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          婚礼详情
        </motion.h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <motion.div
            className="space-y-8"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-start">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-romantic-pink-soft flex items-center justify-center mr-4">
                <svg
                  className="w-6 h-6 text-romantic-pink"
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
              <div>
                <h3 className="text-xl font-serif text-romantic-text mb-2">
                  时间
                </h3>
                <p className="text-romantic-text-soft">
                  {new Date(siteConfig.eventDate).toLocaleDateString("zh-CN", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    weekday: "long",
                  })}
                </p>
                <p className="text-romantic-text-soft mt-1">
                  {siteConfig.venue.time}
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-romantic-pink-soft flex items-center justify-center mr-4">
                <svg
                  className="w-6 h-6 text-romantic-pink"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-serif text-romantic-text mb-2">
                  地点
                </h3>
                <p className="text-romantic-text-soft">
                  {siteConfig.venue.name}
                </p>
                <p className="text-romantic-text-soft mt-1">
                  {siteConfig.venue.address}
                </p>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-romantic-pink-soft flex items-center justify-center mr-4">
                <svg
                  className="w-6 h-6 text-romantic-pink"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-serif text-romantic-text mb-2">
                  交通指引
                </h3>
                <ul className="text-romantic-text-soft space-y-1">
                  {siteConfig.venue.transportation.map((item, index) => (
                    <li key={index} className="flex">
                      <span className="mr-2">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex items-start">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-romantic-pink-soft flex items-center justify-center mr-4">
                <svg
                  className="w-6 h-6 text-romantic-pink"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-serif text-romantic-text mb-2">
                  联系我们
                </h3>
                <p className="text-romantic-text-soft">
                  新郎: {siteConfig.contact.groom.name} {siteConfig.contact.groom.phone}
                </p>
                <p className="text-romantic-text-soft mt-1">
                  新娘: {siteConfig.contact.bride.name} {siteConfig.contact.bride.phone}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            className="h-96 lg:h-auto"
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="w-full h-full bg-romantic-pink-soft rounded-xl overflow-hidden shadow-lg">
              <iframe
                src={siteConfig.venue.mapEmbedUrl}
                className="w-full h-full"
                frameBorder="0"
                allowFullScreen
                aria-hidden="false"
                tabIndex={0}
              ></iframe>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}