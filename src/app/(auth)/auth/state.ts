export type MagicLinkState = {
  status: "idle" | "error" | "sent";
  message: string;
  field?: "email";
};

export const initialMagicLinkState: MagicLinkState = {
  status: "idle",
  message: "",
};

export type PasswordActionState = {
  status: "idle" | "error" | "success";
  message: string;
  field?: "email" | "password" | "confirmPassword";
};

export const initialPasswordActionState: PasswordActionState = {
  status: "idle",
  message: "",
};
