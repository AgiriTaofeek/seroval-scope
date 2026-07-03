import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import "@testing-library/jest-dom/vitest";

// vitest.config.ts doesn't enable `test.globals`, so @testing-library/react's
// own auto-cleanup (which detects a global `afterEach`) never registers —
// without this, DOM from one component test stays mounted into the next
// test in the same file.
afterEach(cleanup);
