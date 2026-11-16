import getUsers from "@/api/resources/users/getUsers";
import resendVerification from "@/api/resources/users/resendVerification";
import verifyUser from "@/api/resources/users/verifyUser";
import { User } from "@/lib/types";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/Table";
import { Button } from "../ui/Button";
import Loader from "../common/Loader";

type PendingAction = { userId: number; action: "resend" | "verify" } | null;

const UsersTable = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingAction>(null);

  useEffect(() => {
    getUsers().then((response) => {
      setLoading(true);
      setUsers(response.users);
    }).catch((error) => {
      console.error(error);
      toast.error("Failed to get users");
      setUsers([]);
    }).finally(() => {
      setLoading(false);
    });
  }, []);

  const replaceUser = (updated: User) => {
    setUsers((current) => current.map((user) => (
      user.id === updated.id ? { ...user, ...updated } : user
    )));
  };

  const handleResend = async (user: User) => {
    setPending({ userId: user.id, action: "resend" });
    try {
      const response = await resendVerification(user.id);
      replaceUser(response.user);
      toast.success(`Verification email sent to ${user.email}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to resend verification email");
    } finally {
      setPending(null);
    }
  };

  const handleVerify = async (user: User) => {
    if (!window.confirm(`Verify ${user.email} without email confirmation?`)) return;

    setPending({ userId: user.id, action: "verify" });
    try {
      const response = await verifyUser(user.id);
      replaceUser(response.user);
      toast.success(`${user.email} verified`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to verify user");
    } finally {
      setPending(null);
    }
  };

  if (loading) {
    return (
      <div className="mt-20">
        <Loader size="lg" />
      </div>
    );
  }
  
  return (
    <Table className="mt-2">
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Jobs</TableHead>
          <TableHead>Last Login</TableHead>
          <TableHead>Admin</TableHead>
          <TableHead>Verified</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>

      <TableBody>
        {users.map((user) => {
          const isPending = pending?.userId === user.id;

          return (
            <TableRow key={user.id}>
              <TableCell>{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{user.job_board_entries_count ?? 0}</TableCell>
              <TableCell>
                {user.last_login_at ? format(user.last_login_at, "MM/dd/yyyy HH:mm") : "-"}
              </TableCell>
              <TableCell>
                {user.admin ? "Yes" : "No"}
              </TableCell>
              <TableCell>
                {user.verified ? "Yes" : "No"}
              </TableCell>
              <TableCell className="text-right">
                {!user.verified && (
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="xs"
                      disabled={isPending}
                      onClick={() => handleResend(user)}
                    >
                      {isPending && pending?.action === "resend" ? "Sending..." : "Resend invite"}
                    </Button>
                    <Button
                      variant="candido"
                      size="xs"
                      disabled={isPending}
                      onClick={() => handleVerify(user)}
                    >
                      {isPending && pending?.action === "verify" ? "Verifying..." : "Verify"}
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  )
}

export default UsersTable;
