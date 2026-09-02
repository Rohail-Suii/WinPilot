"use client";

/**
 * The sending account and the resume that goes with it.
 *
 * Two things have to be true before a single application can go out: a verified
 * Gmail app password, and a resume file. This tab is where both are set, and it
 * says so plainly at the top rather than letting the user discover it from an
 * empty outreach queue three hours later.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Mail,
  FileText,
  Upload,
  Trash2,
  Check,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Send,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface EmailConfig {
  enabled: boolean;
  gmailUser: string;
  hasAppPassword: boolean;
  fromName: string;
  signature: string;
  dailyLimit: number;
  minGapMinutes: number;
  ccSelf: boolean;
  minConfidence: number;
  strictSkillMatch: boolean;
  verifiedAt: string | null;
  envAccount: string;
}

interface StoredResume {
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
}

const APP_PASSWORD_URL = "https://myaccount.google.com/apppasswords";

export function EmailOutreachSettings() {
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [resume, setResume] = useState<StoredResume | null>(null);
  const [gmailUser, setGmailUser] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [emailRes, resumeRes] = await Promise.all([
        fetch("/api/settings/email"),
        fetch("/api/settings/master-resume"),
      ]);
      const emailData = await emailRes.json();
      const resumeData = await resumeRes.json();
      if (emailRes.ok) {
        setConfig(emailData);
        setGmailUser(emailData.gmailUser || "");
      }
      if (resumeRes.ok) setResume(resumeData.resume || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (patch: Record<string, unknown>, successText: string) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      setMessage({ kind: "ok", text: successText });
      setAppPassword("");
      await load();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setSaving(false);
    }
  };

  const connect = () => {
    if (!gmailUser.trim() || !appPassword.trim()) {
      setMessage({ kind: "error", text: "Enter both the Gmail address and its app password" });
      return;
    }
    save(
      { gmailUser: gmailUser.trim(), appPassword: appPassword.trim() },
      "Connected. Gmail accepted the app password."
    );
  };

  const disconnect = async () => {
    if (!confirm("Disconnect this Gmail account? Nothing further will be sent.")) return;
    setSaving(true);
    try {
      await fetch("/api/settings/email", { method: "DELETE" });
      setAppPassword("");
      await load();
      setMessage({ kind: "ok", text: "Disconnected." });
    } finally {
      setSaving(false);
    }
  };

  const uploadResume = async (file: File) => {
    setUploading(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/settings/master-resume", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setResume(data.resume);
      setMessage({ kind: "ok", text: `${data.resume.filename} will be attached to every application.` });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const deleteResume = async () => {
    if (!confirm("Remove your resume? Applications cannot be sent without one.")) return;
    await fetch("/api/settings/master-resume", { method: "DELETE" });
    setResume(null);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-white/40 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading
      </div>
    );
  }

  const connected = Boolean(config?.gmailUser && config?.hasAppPassword) || Boolean(config?.envAccount);
  const ready = connected && Boolean(resume);

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border p-3 text-sm",
            message.kind === "ok"
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/20 bg-red-500/10 text-red-300"
          )}
        >
          {message.kind === "ok" ? (
            <Check className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* ── The account ── */}
      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-white font-medium flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-400" />
              Gmail account
            </h3>
            <p className="text-xs text-white/50 mt-1 max-w-xl">
              Applications are sent through your own Gmail over SMTP, so they are signed by
              Google and land like any other mail you send. That requires an App Password —
              2-Step Verification has to be on, and your normal password will not work.
            </p>
          </div>
          {config?.verifiedAt && (
            <span className="shrink-0 inline-flex items-center gap-1 text-xs text-emerald-400">
              <ShieldCheck className="w-3.5 h-3.5" />
              Verified
            </span>
          )}
        </div>

        {config?.envAccount && !config.gmailUser && (
          <p className="text-xs text-white/40 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
            The server is configured with <span className="text-white/70">{config.envAccount}</span>{" "}
            and will use it unless you connect your own account below.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="gmail-user">Gmail address</Label>
            <Input
              id="gmail-user"
              type="email"
              autoComplete="username"
              placeholder="you@gmail.com"
              value={gmailUser}
              onChange={(e) => setGmailUser(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="gmail-password">App password</Label>
            <Input
              id="gmail-password"
              type="password"
              autoComplete="new-password"
              placeholder={config?.hasAppPassword ? "•••••••••••••••• (saved)" : "abcd efgh ijkl mnop"}
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
            />
            <a
              href={APP_PASSWORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-blue-400 hover:underline"
            >
              Generate one in your Google account
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={connect} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
            {config?.hasAppPassword ? "Update credentials" : "Connect and verify"}
          </Button>
          {connected && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => save({ test: true }, "Test message sent — check your inbox, not Spam.")}
              disabled={saving}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Send a test to yourself
            </Button>
          )}
          {config?.hasAppPassword && (
            <Button size="sm" variant="ghost" onClick={disconnect} disabled={saving}>
              Disconnect
            </Button>
          )}
        </div>
      </Card>

      {/* ── The attachment ── */}
      <Card className="p-5 space-y-4">
        <div>
          <h3 className="text-white font-medium flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-400" />
            Master resume
          </h3>
          <p className="text-xs text-white/50 mt-1 max-w-xl">
            This exact file is attached to every application — it is never regenerated or
            rewritten. PDF is what recruiters expect. Up to 5MB.
          </p>
        </div>

        {resume ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm text-white truncate">{resume.filename}</p>
              <p className="text-xs text-white/40">
                {(resume.size / 1024).toFixed(0)} KB · uploaded{" "}
                {new Date(resume.uploadedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                Replace
              </Button>
              <Button size="sm" variant="ghost" onClick={deleteResume}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => fileInput.current?.click()}
            disabled={uploading}
            className="w-full"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Upload your resume
          </Button>
        )}

        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) uploadResume(file);
          }}
        />
      </Card>

      {/* ── How it behaves ── */}
      <Card className="p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-white font-medium">Send applications automatically</h3>
            <p className="text-xs text-white/50 mt-1 max-w-xl">
              When this is on, a hiring post in your line of work with an email address on it gets
              an application without asking you. A job in another profession is never applied to —
              it is recorded and closed. Anything the agent is unsure about waits for you.
            </p>
            {!ready && (
              <p className="text-xs text-amber-300/80 mt-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {!connected
                  ? "Connect a Gmail account first."
                  : "Upload a resume first — nothing will be sent without one."}
              </p>
            )}
          </div>
          <Switch
            checked={Boolean(config?.enabled)}
            disabled={saving || !ready}
            onCheckedChange={(checked) =>
              save({ enabled: checked }, checked ? "Automatic sending is on." : "Automatic sending is off.")
            }
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Most applications per day"
            hint="Gmail's own ceiling is 500. Staying well under it is what keeps the account healthy."
            value={config?.dailyLimit ?? 20}
            min={1}
            max={400}
            onCommit={(value) => save({ dailyLimit: value }, "Daily limit saved.")}
          />
          <NumberField
            label="Minutes between sends"
            hint="Spacing is what separates a person applying for jobs from a mail merge."
            value={config?.minGapMinutes ?? 6}
            min={1}
            max={240}
            onCommit={(value) => save({ minGapMinutes: value }, "Spacing saved.")}
          />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-white">Only apply when the post names something I have used</p>
            <p className="text-xs text-white/50 mt-0.5 max-w-xl">
              Off by default. Openings outside your line of work are always skipped either way —
              this is stricter still, and holds back a job in your own field when it lists a stack
              you have never touched. A WordPress role, for a React developer, is the kind of thing
              this stops.
            </p>
          </div>
          <Switch
            checked={config?.strictSkillMatch ?? false}
            disabled={saving}
            onCheckedChange={(checked) =>
              save(
                { strictSkillMatch: checked },
                checked ? "Strict skill matching is on." : "Strict skill matching is off."
              )
            }
          />
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-white">Blind-copy me on every application</p>
            <p className="text-xs text-white/50 mt-0.5">
              Puts a copy in your own inbox, so the thread is where you expect it.
            </p>
          </div>
          <Switch
            checked={config?.ccSelf ?? true}
            disabled={saving}
            onCheckedChange={(checked) => save({ ccSelf: checked }, "Saved.")}
          />
        </div>

        <div>
          <Label htmlFor="signature">Signature</Label>
          <Textarea
            id="signature"
            rows={4}
            defaultValue={config?.signature || ""}
            placeholder={"Rohail Ahmed\n+92 333 4922629\nrohail.systems"}
            onBlur={(e) => {
              if (e.target.value !== (config?.signature || "")) {
                save({ signature: e.target.value }, "Signature saved.");
              }
            }}
          />
          <p className="text-xs text-white/40 mt-1">
            Appended verbatim under every email. Keep it to a few plain lines — images and
            long HTML footers are what get a message filtered.
          </p>
        </div>
      </Card>
    </div>
  );
}

/**
 * A number input that saves when the user is done with it, not on every
 * keystroke — each commit is a network round trip and a re-read.
 */
function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [local, setLocal] = useState(String(value));

  useEffect(() => {
    setLocal(String(value));
  }, [value]);

  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        min={min}
        max={max}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const parsed = parseInt(local, 10);
          if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
            setLocal(String(value));
            return;
          }
          if (parsed !== value) onCommit(parsed);
        }}
      />
      <p className="text-xs text-white/40 mt-1">{hint}</p>
    </div>
  );
}
