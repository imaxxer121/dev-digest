import React from "react";
import { render, type RenderResult } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import evalMessages from "../../messages/en/eval.json";
import prReview from "../../messages/en/prReview.json";

export function evalTestClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}
export function evalTestWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}><NextIntlClientProvider locale="en" messages={{ eval: evalMessages, prReview }}>{children}</NextIntlClientProvider></QueryClientProvider>;
  };
}
export function mountEval(ui: React.ReactElement, client = evalTestClient()): Pick<RenderResult, "container" | "rerender" | "unmount"> & { client: QueryClient } {
  const view = render(ui, { wrapper: evalTestWrapper(client) });
  return { container: view.container, rerender: view.rerender, unmount: view.unmount, client };
}
