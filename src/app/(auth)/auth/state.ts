export type MagicLinkState = {
  status: "idle" | "error" | "sent";
  message: string;
  field?: "email";
  retryAfterSeconds?: number;
  email?: string;
};

export const initialMagicLinkState: MagicLinkState = {
  status: "idle",
  message: "",
};

export type PasswordActionState = {
  email?: string;
  status: "idle" | "error" | "success";
  message: string;
  field?: "email" | "password" | "confirmPassword";
  retryAfterSeconds?: number;
};

export const initialPasswordActionState: PasswordActionState = {
  status: "idle",
  message: "",
};

export type EmailCodeState = { status: "idle" | "error"; message: string };
export const initialEmailCodeState: EmailCodeState = {
  status: "idle",
  message: "",
};
