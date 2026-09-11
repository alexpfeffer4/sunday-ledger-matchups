export type MagicLinkState = {
  status: "idle" | "error" | "sent";
  message: string;
  field?: "email";
  retryAfterSeconds?: number;
  email?: string;
  verifyCode?: EmailCodeAction;
};

export const initialMagicLinkState: MagicLinkState = {
  status: "idle",
  message: "",
};

export type PasswordActionState = {
  email?: string;
  verifyCode?: EmailCodeAction;
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
export type EmailCodeAction = (
  state: EmailCodeState,
  data: FormData,
) => Promise<EmailCodeState>;
export const initialEmailCodeState: EmailCodeState = {
  status: "idle",
  message: "",
};
