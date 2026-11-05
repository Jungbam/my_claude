export interface Mail {
  to: string;
  subject: string;
  body: string;
}

export const outbox: Mail[] = [];

export function sendMail(mail: Mail): void {
  outbox.push(mail);
}
