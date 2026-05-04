import * as vscode from 'vscode';
import { FOCUS_URI_PATH } from './constants';
import { focusClaudeSession, type FocusRequest } from './focus';

export class SupernotifyUriHandler implements vscode.UriHandler {
  async handleUri(uri: vscode.Uri): Promise<void> {
    if (uri.path !== FOCUS_URI_PATH) {
      return;
    }
    await focusClaudeSession(parseFocusRequest(uri));
  }
}

function parseFocusRequest(uri: vscode.Uri): FocusRequest {
  const params = new URLSearchParams(uri.query);
  return {
    cwd: getOptionalParam(params, 'cwd'),
    sessionId: getOptionalParam(params, 'sessionId')
  };
}

function getOptionalParam(params: URLSearchParams, name: string): string | undefined {
  const value = params.get(name);
  return value && value.trim() ? value : undefined;
}
