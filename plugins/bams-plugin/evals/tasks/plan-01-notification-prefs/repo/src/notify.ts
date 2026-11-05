import { sendMail } from "./mailer";
import type { User } from "./user";

export type Category = "reminder" | "digest" | "marketing";

export function notify(user: User, category: Category, subject: string, body: string): void {
  sendMail({ to: user.email, subject: `[${category}] ${subject}`, body });
}
