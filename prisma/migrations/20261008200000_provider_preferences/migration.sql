-- CreateTable
CREATE TABLE "ProviderPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderPreference_userId_idx" ON "ProviderPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderPreference_userId_provider_key" ON "ProviderPreference"("userId", "provider");

-- AddForeignKey
ALTER TABLE "ProviderPreference" ADD CONSTRAINT "ProviderPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
