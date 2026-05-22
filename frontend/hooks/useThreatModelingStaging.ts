'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import {
  emptyContextFields,
  type ContextFields,
  type ThreatModelingStaging,
} from '@/types/contextFields';

export type StagingUiStatus = 'idle' | 'extracting' | 'ready' | 'failed' | 'running' | 'expired';

const POLL_MS = 3000;
const HARD_TIMEOUT_MS = 180_000;

function mergeDraftWithEmpty(draft: ContextFields | null | undefined): ContextFields {
  const base = emptyContextFields();
  if (!draft) return base;
  return {
    projectSummary: draft.projectSummary ?? null,
    securityContext: draft.securityContext ?? null,
    deploymentContext: draft.deploymentContext ?? null,
    developerContext: draft.developerContext ?? null,
    suggestedExclusions: draft.suggestedExclusions ?? null,
    additionalContext: null,
  };
}

export const useThreatModelingStaging = () => {
  const [status, setStatus] = useState<StagingUiStatus>('idle');
  const [stagingId, setStagingId] = useState<string | null>(null);
  const [fields, setFields] = useState<ContextFields>(emptyContextFields());
  const [draftFields, setDraftFields] = useState<ContextFields | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const applyStagingPayload = useCallback((payload: ThreatModelingStaging) => {
    const s = payload.status;
    if (s === 'pending' || s === 'extracting') {
      setStatus('extracting');
    } else if (s === 'ready') {
      setStatus('ready');
      const draft = mergeDraftWithEmpty(payload.draftContextFields);
      setDraftFields(draft);
      setFields((prev) => ({
        ...draft,
        additionalContext: prev.additionalContext ?? draft.additionalContext,
      }));
    } else if (s === 'failed') {
      setStatus('failed');
      setError(payload.extractionError ?? 'Context extraction failed');
      setFields(emptyContextFields());
      setDraftFields(null);
    }
  }, []);

  const startPolling = useCallback(
    (id: string) => {
      clearPolling();
      setStatus('extracting');

      const poll = async () => {
        try {
          const data = await api.getThreatModelingStage(id);
          if (!data) {
            clearPolling();
            setStatus('expired');
            setError('Session expired — please re-import the repository.');
            return;
          }
          applyStagingPayload(data as ThreatModelingStaging);
          if (data.status === 'ready' || data.status === 'failed') {
            clearPolling();
          }
        } catch (err) {
          if (err instanceof Error && err.message.includes('404')) {
            clearPolling();
            setStatus('expired');
            setError('Session expired — please re-import the repository.');
          }
        }
      };

      void poll();
      pollRef.current = setInterval(() => void poll(), POLL_MS);

      timeoutRef.current = setTimeout(() => {
        clearPolling();
        if (status === 'extracting') {
          setStatus('failed');
          setError('Context extraction timed out. You can fill in fields manually or try again.');
        }
      }, HARD_TIMEOUT_MS);
    },
    [applyStagingPayload, clearPolling, status],
  );

  useEffect(() => () => clearPolling(), [clearPolling]);

  const startUpload = useCallback(
    async (zipFile: File, repoName?: string) => {
      setError(null);
      const res = await api.stageThreatModelingUpload(zipFile, { repoName });
      setStagingId(res.stagingId);
      startPolling(res.stagingId);
    },
    [startPolling],
  );

  const startGitHub = useCallback(
    async (params: {
      repoUrl: string;
      gitRef: string;
      gitRefType: 'branch' | 'tag' | 'commit';
      repoName?: string;
    }) => {
      setError(null);
      const res = await api.stageGitHubImport(params);
      setStagingId(res.stagingId);
      startPolling(res.stagingId);
    },
    [startPolling],
  );

  const setField = useCallback((name: keyof ContextFields, value: string) => {
    setFields((prev) => ({ ...prev, [name]: value || null }));
  }, []);

  const cancel = useCallback(async () => {
    if (stagingId) {
      try {
        await api.cancelThreatModelingStage(stagingId);
      } catch {
        /* ignore */
      }
    }
    clearPolling();
    reset();
  }, [stagingId, clearPolling]);

  const reset = useCallback(() => {
    clearPolling();
    setStatus('idle');
    setStagingId(null);
    setFields(emptyContextFields());
    setDraftFields(null);
    setError(null);
  }, [clearPolling]);

  const run = useCallback(async () => {
    if (!stagingId) throw new Error('No active staging session');
    setStatus('running');
    setError(null);
    try {
      const result = await api.runThreatModelingStage(stagingId, fields);
      return result;
    } catch (err) {
      if (err instanceof Error && err.message === 'SESSION_EXPIRED') {
        setStatus('expired');
        setError('Session expired — please re-import the repository.');
      } else {
        setStatus(status === 'running' ? 'ready' : status);
        throw err;
      }
    }
  }, [stagingId, fields, status]);

  return {
    status,
    stagingId,
    fields,
    draftFields,
    error,
    startUpload,
    startGitHub,
    run,
    cancel,
    setField,
    reset,
  };
};
