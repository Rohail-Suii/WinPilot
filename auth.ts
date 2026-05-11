import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db/connection";
import User from "@/lib/db/models/user";
import { authConfig } from "@/auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required");
        }

        await connectDB();

        const user = await User.findOne({
          email: (credentials.email as string).toLowerCase(),
        }).select("+hashedPassword");

        if (!user || !user.hashedPassword) {
          throw new Error("Invalid email or password");
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password as string,
          user.hashedPassword
        );

        if (!isPasswordValid) {
          throw new Error("Invalid email or password");
        }

        // Block unverified email accounts
        if (!user.emailVerified) {
          throw new Error("EMAIL_NOT_VERIFIED");
        }

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
    ...authConfig.providers.filter(
      (p) => (p as { type?: string }).type !== "credentials"
    ),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider !== "credentials") {
        await connectDB();
        const existingUser = await User.findOne({ email: user.email });
        if (!existingUser) {
          await User.create({
            name: user.name ?? "User",
            email: user.email!,
            image: user.image ?? undefined,
            emailVerified: new Date(),
          });
        }
      }
      return true;
    },
    async jwt({ token, user, trigger, session }) {
      // When user logs in (new session or new session creation)
      if (user) {
        await connectDB();
        // For OAuth/social login providers, resolve to MongoDB ObjectId
        const dbUser = await User.findOne({ email: user.email }).lean();
        if (dbUser) {
          token.id = dbUser._id.toString();
        } else {
          // Fallback for cases where user.id is already a MongoDB ObjectId string
          token.id = user.id;
        }
        token.iat = Math.floor(Date.now() / 1000);
      }
      if (trigger === "update" && session) {
        token.name = session.name;
        token.image = session.image;
      }
      // Rotate token every 24 hours
      const iat = (token.iat as number) || 0;
      const now = Math.floor(Date.now() / 1000);
      if (now - iat > 24 * 60 * 60) {
        token.iat = now;
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
