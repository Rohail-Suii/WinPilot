"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Users,
  UserPlus,
  Send,
  Check,
  X,
  ExternalLink,
  RefreshCw,
  Trash2,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnectionRequest {
  _id: string;
  targetName: string;
  targetHeadline: string;
  targetProfileUrl: string;
  message: string;
  status: "pending" | "sent" | "accepted" | "ignored";
  sentAt?: string;
  acceptedAt?: string;
  createdAt: string;
}

interface ConnectionStats {
  pending?: number;
  sent?: number;
  accepted?: number;
  ignored?: number;
  total: number;
  acceptanceRate: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConnectionsClient() {
  const [connections, setConnections] = useState<ConnectionRequest[]>([]);
  const [stats, setStats] = useState<ConnectionStats>({ total: 0, acceptanceRate: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [targetName, setTargetName] = useState("");
  const [targetHeadline, setTargetHeadline] = useState("");
  const [targetProfileUrl, setTargetProfileUrl] = useState("");
  const [message, setMessage] = useState("");

  const fetchConnections = useCallback(async (status?: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const res = await fetch(`/api/connections?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConnections(data.connections || []);
      setStats(data.stats || { total: 0, acceptanceRate: 0 });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load connections");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnections(activeTab);
  }, [activeTab, fetchConnections]);

  const handleSend = async () => {
    if (!targetName || !targetProfileUrl) {
      toast.error("Name and profile URL are required");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/connections?action=send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetName, targetHeadline, targetProfileUrl, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Connection request created");
      setShowNewDialog(false);
      setTargetName("");
      setTargetHeadline("");
      setTargetProfileUrl("");
      setMessage("");
      fetchConnections(activeTab);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create connection request");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch("/api/connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Status updated to ${status}`);
      fetchConnections(activeTab);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/connections?id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Connection request removed");
      fetchConnections(activeTab);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete");
    }
  };

  const statusBadgeVariant = (status: string) => {
    switch (status) {
      case "pending": return "warning" as const;
      case "sent": return "info" as const;
      case "accepted": return "success" as const;
      case "ignored": return "error" as const;
      default: return "default" as const;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Connection Manager</h1>
          <p className="text-white/50 mt-1">
            Manage your LinkedIn connection requests
          </p>
        </div>
        <Button onClick={() => setShowNewDialog(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          New Connection
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                <Users className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-white/50">Total</p>
                <p className="text-xl font-bold text-white">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20">
                <Clock className="h-5 w-5 text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-white/50">Pending</p>
                <p className="text-xl font-bold text-white">{stats.pending || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20">
                <Check className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-white/50">Accepted</p>
                <p className="text-xl font-bold text-white">{stats.accepted || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20">
                <TrendingUp className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-sm text-white/50">Accept Rate</p>
                <p className="text-xl font-bold text-white">{stats.acceptanceRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="sent">Sent</TabsTrigger>
            <TabsTrigger value="accepted">Accepted</TabsTrigger>
            <TabsTrigger value="ignored">Ignored</TabsTrigger>
          </TabsList>
          <Button variant="ghost" size="sm" onClick={() => fetchConnections(activeTab)}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        <TabsContent value={activeTab}>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : connections.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-white/20 mb-4" />
                <p className="text-white/50">No {activeTab} connection requests</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {connections.map((conn) => (
                <Card key={conn._id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-white font-medium truncate">
                            {conn.targetName}
                          </h3>
                          <Badge variant={statusBadgeVariant(conn.status)}>
                            {conn.status}
                          </Badge>
                        </div>
                        {conn.targetHeadline && (
                          <p className="text-sm text-white/50 truncate">
                            {conn.targetHeadline}
                          </p>
                        )}
                        {conn.message && (
                          <p className="text-sm text-white/40 mt-1 truncate">
                            &quot;{conn.message}&quot;
                          </p>
                        )}
                        <p className="text-xs text-white/30 mt-1">
                          {new Date(conn.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(conn.targetProfileUrl, "_blank")}
                          title="View Profile"
                        >
                          <ExternalLink className="h-4 w-4 text-white/40" />
                        </Button>
                        {conn.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleUpdateStatus(conn._id, "sent")}
                            title="Mark as Sent"
                          >
                            <Send className="h-4 w-4 text-blue-400" />
                          </Button>
                        )}
                        {conn.status === "sent" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleUpdateStatus(conn._id, "accepted")}
                              title="Mark as Accepted"
                            >
                              <Check className="h-4 w-4 text-emerald-400" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleUpdateStatus(conn._id, "ignored")}
                              title="Mark as Ignored"
                            >
                              <X className="h-4 w-4 text-red-400" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(conn._id)}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-white/30 hover:text-red-400" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* New Connection Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Connection Request</DialogTitle>
            <DialogDescription>
              Add a new LinkedIn connection request to track.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="targetName">Name *</Label>
              <Input
                id="targetName"
                placeholder="John Doe"
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="targetHeadline">Headline</Label>
              <Input
                id="targetHeadline"
                placeholder="Software Engineer at Google"
                value={targetHeadline}
                onChange={(e) => setTargetHeadline(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="targetProfileUrl">Profile URL *</Label>
              <Input
                id="targetProfileUrl"
                placeholder="https://linkedin.com/in/johndoe"
                value={targetProfileUrl}
                onChange={(e) => setTargetProfileUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Personal Message</Label>
              <Textarea
                id="message"
                placeholder="Hi John, I'd love to connect..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={300}
              />
              <p className="text-xs text-white/30">{message.length}/300</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowNewDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={submitting}>
              {submitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              Create Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
