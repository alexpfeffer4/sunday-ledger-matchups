export type AppActionState = {
  status: "idle" | "success" | "error";
  message: string;
  href?: string;
  hrefLabel?: string;
  value?: string;
};

export const initialAppActionState: AppActionState = {
  status: "idle",
  message: "",
};
