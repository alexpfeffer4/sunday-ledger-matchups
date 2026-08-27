export type MagicLinkState = {
  status: "idle" | "error" | "sent";
  message: string;
};

export const initialMagicLinkState: MagicLinkState = {
  status: "idle",
  message: "",
};
