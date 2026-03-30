/// <reference types="office-js" />

/**
 * Reads the Outlook conversation ID for the current mail item (read or compose).
 * Returns null when unavailable (e.g. compose with no conversation yet).
 */
export function readConversationIdFromItem(
  item: Office.MessageRead | Office.MessageCompose | null,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (!item) {
      resolve(null);
      return;
    }

    const read = item as Office.MessageRead & {
      getConversationIdAsync?: (
        cb: (result: Office.AsyncResult<string>) => void,
      ) => void;
      conversationId?: string;
    };

    if (typeof read.getConversationIdAsync === "function") {
      read.getConversationIdAsync((result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded && result.value) {
          resolve(result.value);
        } else {
          resolve(null);
        }
      });
      return;
    }

    if (typeof read.conversationId === "string" && read.conversationId.length > 0) {
      resolve(read.conversationId);
      return;
    }

    resolve(null);
  });
}

/**
 * Subject line for the current item (used when conversation IDs differ between Graph and Office).
 */
export function readSubjectFromItem(
  item: Office.MessageRead | Office.MessageCompose | null,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (!item) {
      resolve(null);
      return;
    }

    const i = item as Office.MessageRead & {
      subject?: string;
      getSubjectAsync?: (cb: (result: Office.AsyncResult<string>) => void) => void;
    };

    if (typeof i.subject === "string" && i.subject.trim()) {
      resolve(i.subject);
      return;
    }

    if (typeof i.getSubjectAsync === "function") {
      i.getSubjectAsync((result) => {
        if (result.status === Office.AsyncResultStatus.Succeeded && result.value?.trim()) {
          resolve(result.value);
        } else {
          resolve(null);
        }
      });
      return;
    }

    resolve(null);
  });
}
