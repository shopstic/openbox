// Inspired by the deprecated/removed std/mime module

import { assert, BufReader, equals, indexOfNeedle, lastIndexOfNeedle, startsWith } from "../deps.ts";
import { MineHeaderReader } from "./mine_header_reader.ts";

const encoder = new TextEncoder();

/**
 * Checks whether `buf` should be considered to match the boundary.
 *
 * The prefix is "--boundary" or "\r\n--boundary" or "\n--boundary", and the
 * caller has verified already that `hasPrefix(buf, prefix)` is true.
 *
 * `matchAfterPrefix()` returns `1` if the buffer does match the boundary,
 * meaning the prefix is followed by a dash, space, tab, cr, nl, or EOF.
 *
 * It returns `-1` if the buffer definitely does NOT match the boundary,
 * meaning the prefix is followed by some other character.
 * For example, "--foobar" does not match "--foo".
 *
 * It returns `0` more input needs to be read to make the decision,
 * meaning that `buf.length` and `prefix.length` are the same.
 */
const SPACE = " ".charCodeAt(0);
const TAB = "\t".charCodeAt(0);
const CR = "\r".charCodeAt(0);
const LF = "\n".charCodeAt(0);
const DASH = "-".charCodeAt(0);

export function matchAfterPrefix(
  buf: Uint8Array,
  prefix: Uint8Array,
  eof: boolean,
): -1 | 0 | 1 {
  if (buf.length === prefix.length) {
    return eof ? 1 : 0;
  }
  const c = buf[prefix.length];
  if (
    c === SPACE ||
    c === TAB ||
    c === CR ||
    c === LF ||
    c === DASH
  ) {
    return 1;
  }
  return -1;
}

/**
 * Scans `buf` to identify how much of it can be safely returned as part of the
 * `PartReader` body.
 *
 * @param buf - The buffer to search for boundaries.
 * @param dashBoundary - Is "--boundary".
 * @param newLineDashBoundary - Is "\r\n--boundary" or "\n--boundary", depending
 * on what mode we are in. The comments below (and the name) assume
 * "\n--boundary", but either is accepted.
 * @param total - The number of bytes read out so far. If total == 0, then a
 * leading "--boundary" is recognized.
 * @param eof - Whether `buf` contains the final bytes in the stream before EOF.
 * If `eof` is false, more bytes are expected to follow.
 * @returns The number of data bytes from buf that can be returned as part of
 * the `PartReader` body.
 */
export function scanUntilBoundary(
  buf: Uint8Array,
  dashBoundary: Uint8Array,
  newLineDashBoundary: Uint8Array,
  total: number,
  eof: boolean,
): number | null {
  if (total === 0) {
    // At beginning of body, allow dashBoundary.
    if (startsWith(buf, dashBoundary)) {
      switch (matchAfterPrefix(buf, dashBoundary, eof)) {
        case -1:
          return dashBoundary.length;
        case 0:
          return 0;
        case 1:
          return null;
      }
    }
    if (startsWith(dashBoundary, buf)) {
      return 0;
    }
  }

  // Search for "\n--boundary".
  const i = indexOfNeedle(buf, newLineDashBoundary);
  if (i >= 0) {
    switch (matchAfterPrefix(buf.slice(i), newLineDashBoundary, eof)) {
      case -1:
        return i + newLineDashBoundary.length;
      case 0:
        return i;
      case 1:
        return i > 0 ? i : null;
    }
  }
  if (startsWith(newLineDashBoundary, buf)) {
    return 0;
  }

  // Otherwise, anything up to the final \n is not part of the boundary and so
  // must be part of the body. Also, if the section from the final \n onward is
  // not a prefix of the boundary, it too must be part of the body.
  const j = lastIndexOfNeedle(buf, newLineDashBoundary.slice(0, 1));
  if (j >= 0 && startsWith(newLineDashBoundary, buf.slice(j))) {
    return j;
  }

  return buf.length;
}

export class PartReader implements Deno.Reader, Deno.Closer {
  n: number | null = 0;
  total = 0;

  constructor(private mr: StreamingMultipartReader, public readonly headers: Headers) {}

  async read(p: Uint8Array): Promise<number | null> {
    const br = this.mr.bufReader;

    // Read into buffer until we identify some data to return,
    // or we find a reason to stop (boundary or EOF).
    let peekLength = 1;
    while (this.n === 0) {
      peekLength = Math.max(peekLength, br.buffered());
      const peekBuf = await br.peek(peekLength);
      if (peekBuf === null) {
        throw new Deno.errors.UnexpectedEof();
      }
      const eof = peekBuf.length < peekLength;
      this.n = scanUntilBoundary(
        peekBuf,
        this.mr.dashBoundary,
        this.mr.newLineDashBoundary,
        this.total,
        eof,
      );
      if (this.n === 0) {
        // Force buffered I/O to read more into buffer.
        assert(eof === false);
        peekLength++;
      }
    }

    if (this.n === null) {
      return null;
    }

    const nread = Math.min(p.length, this.n);
    const buf = p.subarray(0, nread);
    const r = await br.readFull(buf);
    assert(r === buf);
    this.n -= nread;
    this.total += nread;
    return nread;
  }

  close(): void {}

  #contentDisposition!: string;
  #contentDispositionParams!: { [key: string]: string };

  #getContentDispositionParams(): { [key: string]: string } {
    if (this.#contentDispositionParams) return this.#contentDispositionParams;
    const cd = this.headers.get("content-disposition");
    const params: { [key: string]: string } = {};
    assert(cd !== null, "content-disposition must be set");
    const comps = decodeURI(cd).split(";");
    this.#contentDisposition = comps[0];
    comps
      .slice(1)
      .map((v: string): string => v.trim())
      .map((kv: string): void => {
        const [k, v] = kv.split("=");
        if (v) {
          const s = v.charAt(0);
          const e = v.charAt(v.length - 1);
          if ((s === e && s === '"') || s === "'") {
            params[k] = v.substr(1, v.length - 2);
          } else {
            params[k] = v;
          }
        }
      });
    return (this.#contentDispositionParams = params);
  }

  get fileName(): string | undefined {
    return this.#getContentDispositionParams()["filename"];
  }

  get formName(): string | undefined {
    const p = this.#getContentDispositionParams();
    if (this.#contentDisposition === "form-data") {
      return p["name"];
    }
    return "";
  }
}

function skipLWSPChar(u: Uint8Array): Uint8Array {
  const ret = new Uint8Array(u.length);
  const sp = " ".charCodeAt(0);
  const ht = "\t".charCodeAt(0);
  let j = 0;
  for (let i = 0; i < u.length; i++) {
    if (u[i] === sp || u[i] === ht) continue;
    ret[j++] = u[i];
  }
  return ret.slice(0, j);
}

/**
 * Reader for parsing multipart/form-data */
export class StreamingMultipartReader {
  readonly newLine: Uint8Array;
  readonly newLineDashBoundary: Uint8Array;
  readonly dashBoundaryDash: Uint8Array;
  readonly dashBoundary: Uint8Array;
  readonly bufReader: BufReader;

  constructor(reader: Deno.Reader, private boundary: string) {
    this.newLine = encoder.encode("\r\n");
    this.newLineDashBoundary = encoder.encode(`\r\n--${boundary}`);
    this.dashBoundaryDash = encoder.encode(`--${this.boundary}--`);
    this.dashBoundary = encoder.encode(`--${this.boundary}`);
    this.bufReader = new BufReader(reader);
  }

  async *partReaders() {
    while (true) {
      const partReader = await this.#nextPart();

      if (partReader === null) {
        break;
      }

      if (partReader.formName === "") {
        continue;
      }

      yield partReader;
    }
  }

  #currentPart: PartReader | undefined;
  #partsRead = 0;

  async #nextPart(): Promise<PartReader | null> {
    if (this.#currentPart) {
      this.#currentPart.close();
    }
    if (equals(this.dashBoundary, encoder.encode("--"))) {
      throw new Error("boundary is empty");
    }
    let expectNewPart = false;
    for (;;) {
      const line = await this.bufReader.readSlice("\n".charCodeAt(0));
      if (line === null) {
        throw new Deno.errors.UnexpectedEof();
      }
      if (this.#isBoundaryDelimiterLine(line)) {
        this.#partsRead++;
        const r = new MineHeaderReader(this.bufReader);
        const headers = await r.readMimeHeader();
        if (headers === null) {
          throw new Deno.errors.UnexpectedEof();
        }
        const newPart = new PartReader(this, headers);
        this.#currentPart = newPart;
        return newPart;
      }
      if (this.#isFinalBoundary(line)) {
        return null;
      }
      if (expectNewPart) {
        throw new Error(`expecting a new Part; got line ${line}`);
      }
      if (this.#partsRead === 0) {
        continue;
      }
      if (equals(line, this.newLine)) {
        expectNewPart = true;
        continue;
      }
      throw new Error(`unexpected line in nextPart(): ${line}`);
    }
  }

  #isFinalBoundary(line: Uint8Array): boolean {
    if (!startsWith(line, this.dashBoundaryDash)) {
      return false;
    }
    const rest = line.slice(this.dashBoundaryDash.length, line.length);
    return rest.length === 0 || equals(skipLWSPChar(rest), this.newLine);
  }

  #isBoundaryDelimiterLine(line: Uint8Array): boolean {
    if (!startsWith(line, this.dashBoundary)) {
      return false;
    }
    const rest = line.slice(this.dashBoundary.length);
    return equals(skipLWSPChar(rest), this.newLine);
  }
}
