/**
 * Node.js IPC Transport for Capnweb RPC
 *
 * Adapts Node.js child_process IPC channel to capnweb's RpcTransport interface.
 * Used for communication between main process and extension host processes.
 */

import type { ChildProcess } from "child_process";
import type { RpcTransport } from "capnweb";
import { log } from "@/services/log";

/**
 * Transport adapter for capnweb over Node.js IPC (child_process.fork)
 *
 * Wraps a ChildProcess's IPC channel to provide capnweb's RpcTransport interface.
 * Handles message queueing when receiver is not ready.
 */
export class NodeIpcTransport implements RpcTransport {
  private receiveQueue: string[] = [];
  private receiveResolver?: (message: string) => void;
  private receiveRejecter?: (error: Error) => void;
  private error?: Error;
  private messageHandler: (message: any) => void;
  private disconnectHandler: () => void;
  private errorHandler: (error: Error) => void;

  constructor(
    private process: ChildProcess,
    private debugName: string = "IPC"
  ) {
    // Set up message handler
    this.messageHandler = (message: any) => {
      if (this.error) {
        // Already errored, ignore further messages
        return;
      }

      if (typeof message === "string") {
        // Capnweb messages are strings (JSON)
        if (this.receiveResolver) {
          this.receiveResolver(message);
          this.receiveResolver = undefined;
          this.receiveRejecter = undefined;
        } else {
          this.receiveQueue.push(message);
        }
      } else {
        // Non-string message, might be a control message or error
        log.debug(`[${this.debugName}] Received non-string message:`, message);
      }
    };

    this.disconnectHandler = () => {
      this.receivedError(new Error("IPC channel disconnected"));
    };

    this.errorHandler = (error: Error) => {
      this.receivedError(error);
    };

    this.process.on("message", this.messageHandler);
    this.process.on("disconnect", this.disconnectHandler);
    this.process.on("error", this.errorHandler);
  }

  async send(message: string): Promise<void> {
    if (this.error) {
      throw this.error;
    }

    if (!this.process.send) {
      throw new Error("Process does not have IPC channel");
    }

    // Send message via IPC
    // Note: process.send returns boolean indicating if message was sent
    const sent = this.process.send(message);
    if (!sent) {
      throw new Error("Failed to send IPC message");
    }
  }

  async receive(): Promise<string> {
    if (this.receiveQueue.length > 0) {
      return this.receiveQueue.shift()!;
    } else if (this.error) {
      throw this.error;
    } else {
      return new Promise<string>((resolve, reject) => {
        this.receiveResolver = resolve;
        this.receiveRejecter = reject;
      });
    }
  }

  abort?(reason: any): void {
    if (!this.error) {
      this.error = reason instanceof Error ? reason : new Error(String(reason));

      // Clean up event listeners
      this.process.off("message", this.messageHandler);
      this.process.off("disconnect", this.disconnectHandler);
      this.process.off("error", this.errorHandler);

      // Reject pending receive if any
      if (this.receiveRejecter) {
        this.receiveRejecter(this.error);
        this.receiveResolver = undefined;
        this.receiveRejecter = undefined;
      }
    }
  }

  private receivedError(reason: Error) {
    if (!this.error) {
      this.error = reason;

      // Clean up event listeners
      this.process.off("message", this.messageHandler);
      this.process.off("disconnect", this.disconnectHandler);
      this.process.off("error", this.errorHandler);

      // Reject pending receive if any
      if (this.receiveRejecter) {
        this.receiveRejecter(reason);
        this.receiveResolver = undefined;
        this.receiveRejecter = undefined;
      }
    }
  }

  /**
   * Clean up resources. Should be called when transport is no longer needed.
   */
  dispose() {
    this.abort?.(new Error("Transport disposed"));
  }
}

/**
 * Transport for the extension host side (running in child process)
 *
 * Uses process.send() and process.on('message') for IPC communication.
 */
export class NodeIpcProcessTransport implements RpcTransport {
  private receiveQueue: string[] = [];
  private receiveResolver?: (message: string) => void;
  private receiveRejecter?: (error: Error) => void;
  private error?: Error;
  private messageHandler: (message: any) => void;
  private disconnectHandler: () => void;

  constructor(private debugName: string = "ProcessIPC") {
    if (!process.send) {
      throw new Error("Process does not have IPC channel (not forked?)");
    }

    this.messageHandler = (message: any) => {
      if (this.error) {
        return;
      }

      if (typeof message === "string") {
        if (this.receiveResolver) {
          this.receiveResolver(message);
          this.receiveResolver = undefined;
          this.receiveRejecter = undefined;
        } else {
          this.receiveQueue.push(message);
        }
      }
    };

    this.disconnectHandler = () => {
      this.receivedError(new Error("IPC channel disconnected"));
    };

    process.on("message", this.messageHandler);
    process.on("disconnect", this.disconnectHandler);
  }

  async send(message: string): Promise<void> {
    if (this.error) {
      throw this.error;
    }

    if (!process.send) {
      throw new Error("Process does not have IPC channel");
    }

    const sent = process.send(message);
    if (!sent) {
      throw new Error("Failed to send IPC message");
    }
  }

  async receive(): Promise<string> {
    if (this.receiveQueue.length > 0) {
      return this.receiveQueue.shift()!;
    } else if (this.error) {
      throw this.error;
    } else {
      return new Promise<string>((resolve, reject) => {
        this.receiveResolver = resolve;
        this.receiveRejecter = reject;
      });
    }
  }

  abort?(reason: any): void {
    if (!this.error) {
      this.error = reason instanceof Error ? reason : new Error(String(reason));

      process.off("message", this.messageHandler);
      process.off("disconnect", this.disconnectHandler);

      if (this.receiveRejecter) {
        this.receiveRejecter(this.error);
        this.receiveResolver = undefined;
        this.receiveRejecter = undefined;
      }
    }
  }

  private receivedError(reason: Error) {
    if (!this.error) {
      this.error = reason;

      process.off("message", this.messageHandler);
      process.off("disconnect", this.disconnectHandler);

      if (this.receiveRejecter) {
        this.receiveRejecter(reason);
        this.receiveResolver = undefined;
        this.receiveRejecter = undefined;
      }
    }
  }

  dispose() {
    this.abort?.(new Error("Transport disposed"));
  }
}
