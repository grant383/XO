import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (_error, request, context) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ logger }, { reportRequestError }] = await Promise.all([
      import("./platform/observability/logger"),
      import("./platform/observability/request-error"),
    ]);
    reportRequestError(logger, request, context);
  }
};
