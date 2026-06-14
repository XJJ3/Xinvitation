"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { siteConfig } from "@/config/site";

export function Countdown() {
  const [timeLeft, setTimeLeft] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = +new Date(siteConfig.eventDate) - +new Date();
      let time = {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
      };

      if (difference > 0) {
        time = {
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        };
      }

      return time;
    };

    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    setTimeLeft(calculateTimeLeft());

    return () => clearInterval(timer);
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.5,
      },
    },
  };

  return (
    <section className="py-16 px-4 bg-romantic-bg-soft">
      <div className="max-w-4xl mx-auto text-center">
        <motion.h2
          className="text-3xl md:text-4xl font-serif text-romantic-pink mb-12"
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          距离我们的幸福时刻
        </motion.h2>

        <motion.div
          className="flex justify-center space-x-2 md:space-x-8"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <motion.div variants={itemVariants} className="flex flex-col items-center">
            <div className="w-20 h-20 md:w-24 md:h-24 flex items-center justify-center bg-white rounded-xl shadow-lg border border-romantic-pink-soft">
              <span className="text-2xl md:text-3xl font-bold text-romantic-pink">
                {timeLeft.days.toString().padStart(2, "0")}
              </span>
            </div>
            <span className="mt-2 text-romantic-text-soft">天</span>
          </motion.div>

          <motion.div variants={itemVariants} className="flex flex-col items-center">
            <div className="w-20 h-20 md:w-24 md:h-24 flex items-center justify-center bg-white rounded-xl shadow-lg border border-romantic-pink-soft">
              <span className="text-2xl md:text-3xl font-bold text-romantic-pink">
                {timeLeft.hours.toString().padStart(2, "0")}
              </span>
            </div>
            <span className="mt-2 text-romantic-text-soft">时</span>
          </motion.div>

          <motion.div variants={itemVariants} className="flex flex-col items-center">
            <div className="w-20 h-20 md:w-24 md:h-24 flex items-center justify-center bg-white rounded-xl shadow-lg border border-romantic-pink-soft">
              <span className="text-2xl md:text-3xl font-bold text-romantic-pink">
                {timeLeft.minutes.toString().padStart(2, "0")}
              </span>
            </div>
            <span className="mt-2 text-romantic-text-soft">分</span>
          </motion.div>

          <motion.div variants={itemVariants} className="flex flex-col items-center">
            <div className="w-20 h-20 md:w-24 md:h-24 flex items-center justify-center bg-white rounded-xl shadow-lg border border-romantic-pink-soft">
              <span className="text-2xl md:text-3xl font-bold text-romantic-pink">
                {timeLeft.seconds.toString().padStart(2, "0")}
              </span>
            </div>
            <span className="mt-2 text-romantic-text-soft">秒</span>
          </motion.div>
        </motion.div>

        <motion.p
          className="mt-12 text-lg text-romantic-text max-w-2xl mx-auto"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          期待与您共同见证这份美好
        </motion.p>
      </div>
    </section>
  );
}