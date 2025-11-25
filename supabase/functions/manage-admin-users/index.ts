import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_ANON_KEY") ?? "",
            { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
        );

        // 1. Verify the caller is an admin
        const {
            data: { user },
        } = await supabaseClient.auth.getUser();

        if (!user) throw new Error("Unauthorized");

        const { data: adminCheck } = await supabaseClient
            .from("app_admins")
            .select("user_id")
            .eq("user_id", user.id)
            .single();

        if (!adminCheck) throw new Error("Unauthorized: Not an admin");

        // 2. Initialize Service Role Client for admin actions
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const { action, email, password, userId } = await req.json();

        if (action === "create") {
            if (!email || !password) throw new Error("Email and password required");

            // Create user in Auth
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
            });

            if (createError) throw createError;
            if (!newUser.user) throw new Error("Failed to create user");

            // Add to app_admins
            const { error: insertError } = await supabaseAdmin
                .from("app_admins")
                .insert({ user_id: newUser.user.id });

            if (insertError) {
                // Rollback auth user creation if admin insert fails
                await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
                throw insertError;
            }

            // Log action
            const { error: logError } = await supabaseAdmin.from("admin_audit_log").insert({
                user_id: user.id,
                action: "create_admin",
                details: { target_email: email, target_user_id: newUser.user.id },
            });

            if (logError) {
                console.error("Failed to log create_admin:", logError);
            }

            return new Response(JSON.stringify({ user: newUser.user }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        } else if (action === "delete") {
            if (!userId) throw new Error("User ID required");

            console.log(`Attempting to delete user: ${userId}`);

            // Remove from app_admins first
            const { error: deleteAdminError } = await supabaseAdmin
                .from("app_admins")
                .delete()
                .eq("user_id", userId);

            if (deleteAdminError) {
                console.error("Failed to delete from app_admins:", deleteAdminError);
                throw deleteAdminError;
            }

            // Delete from Auth
            const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);

            if (deleteAuthError) {
                console.error("Failed to delete from Auth:", deleteAuthError);
                throw deleteAuthError;
            }

            // Log action
            const { error: logError } = await supabaseAdmin.from("admin_audit_log").insert({
                user_id: user.id,
                action: "delete_admin",
                details: { target_user_id: userId },
            });

            if (logError) {
                console.error("Failed to log delete_admin:", logError);
            }

            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        } else if (action === "list") {
            // List all admins
            // 1. Get all user IDs from app_admins
            const { data: adminIds, error: adminError } = await supabaseAdmin
                .from("app_admins")
                .select("user_id");

            if (adminError) throw adminError;

            const userIds = adminIds.map((a) => a.user_id);

            // 2. Fetch user details from Auth (admin API)
            // Note: listUsers() might be paginated, but for now we assume < 50 admins.
            // A better approach for scale would be to iterate or filter.
            const { data: { users }, error: usersError } = await supabaseAdmin.auth.admin.listUsers();

            if (usersError) throw usersError;

            const admins = users
                .filter((u) => userIds.includes(u.id))
                .map((u) => ({
                    id: u.id,
                    email: u.email,
                    created_at: u.created_at,
                    is_admin: true,
                }));

            return new Response(JSON.stringify({ admins }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        } else {
            throw new Error("Invalid action");
        }
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
