import { promises as fs } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");

type WithMeta<T> = T & { id: string; createdAt: string };

async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "ENOENT"
  );
}

async function readArray<T>(filename: string): Promise<T[]> {
  await ensureDataDir();
  const filepath = join(DATA_DIR, filename);
  try {
    const content = await fs.readFile(filepath, "utf-8");
    return JSON.parse(content) as T[];
  } catch (error) {
    if (isFileNotFound(error)) return [];
    console.error(`读取 ${filename} 失败:`, error);
    return [];
  }
}

async function appendEntry<T>(filename: string, data: T): Promise<WithMeta<T>> {
  const existing = await readArray<WithMeta<T>>(filename);
  const entry: WithMeta<T> = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  existing.push(entry);
  await fs.writeFile(
    join(DATA_DIR, filename),
    JSON.stringify(existing, null, 2),
    "utf-8"
  );
  return entry;
}

export type RsvpInput = {
  name: string;
  email?: string;
  attending: "yes" | "no";
  guests: string;
  message?: string;
};

export type RsvpRecord = WithMeta<RsvpInput>;

export type GuestbookInput = {
  name: string;
  message: string;
};

export type GuestbookRecord = WithMeta<GuestbookInput>;

export function saveRsvp(data: RsvpInput): Promise<RsvpRecord> {
  return appendEntry("rsvp.json", data);
}

export function loadRsvps(): Promise<RsvpRecord[]> {
  return readArray<RsvpRecord>("rsvp.json");
}

export function saveGuestbookEntry(
  data: GuestbookInput
): Promise<GuestbookRecord> {
  return appendEntry("guestbook.json", data);
}

export async function loadGuestbookEntries(): Promise<GuestbookRecord[]> {
  const entries = await readArray<GuestbookRecord>("guestbook.json");
  return entries.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}
