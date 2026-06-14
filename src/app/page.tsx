import { Hero } from "@/components/Hero";
import { Countdown } from "@/components/Countdown";
import { Story } from "@/components/Story";
import { Venue } from "@/components/Venue";
import { Rsvp } from "@/components/Rsvp";
import { Guestbook } from "@/components/Guestbook";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-romantic-pink-soft">
      <Hero />
      <Countdown />
      <Story />
      <Venue />
      <Rsvp />
      <Guestbook />
      <Footer />
    </div>
  );
}