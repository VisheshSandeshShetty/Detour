-- CreateTable
CREATE TABLE "SavedTrip" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "originName" TEXT NOT NULL,
    "originLatitude" DOUBLE PRECISION NOT NULL,
    "originLongitude" DOUBLE PRECISION NOT NULL,
    "destinationName" TEXT NOT NULL,
    "destinationLatitude" DOUBLE PRECISION NOT NULL,
    "destinationLongitude" DOUBLE PRECISION NOT NULL,
    "corridorRadius" INTEGER,
    "totalDistanceKm" DOUBLE PRECISION NOT NULL,
    "totalDurationMin" DOUBLE PRECISION NOT NULL,
    "drivingDistanceKm" DOUBLE PRECISION NOT NULL,
    "drivingDurationMin" DOUBLE PRECISION NOT NULL,
    "geometry" JSONB,
    "stops" JSONB NOT NULL,
    "settings" JSONB,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedTrip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedTrip_userId_createdAt_idx" ON "SavedTrip"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedTrip_userId_fingerprint_key" ON "SavedTrip"("userId", "fingerprint");

-- AddForeignKey
ALTER TABLE "SavedTrip" ADD CONSTRAINT "SavedTrip_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
