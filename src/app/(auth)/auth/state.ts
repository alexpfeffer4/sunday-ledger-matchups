export type MagicLinkState = {
  status: "idle" | "error" | "sent";
  message: string;
};

export const initialMagicLinkState: MagicLinkState = {
  status: "idle",
  message: "",
};

export type PasswordActionState = {
  status: "idle" | "error" | "success";
  message: string;
};

export const initialPasswordActionState: PasswordActionState = {
  status: "idle",
  message: "",
};
