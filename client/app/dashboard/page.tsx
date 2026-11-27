"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ArrowRightIcon } from "lucide-react";
import { format } from "date-fns";
import getJobBoardEntriesStats from "@/api/resources/jobBoardEntries/getJobBoardEntriesStats";
import Loader from "@/components/common/Loader";
import PageContainer from "@/components/common/PageContainer";
import ClosingSoon from "@/components/dashboard/ClosingSoon";
import DashboardCard from "@/components/dashboard/DashboardCard";
import Eyebrow from "@/components/dashboard/Eyebrow";
import PipelineChart from "@/components/dashboard/PipelineChart";
import StatTile from "@/components/dashboard/StatTile";
import TopTags from "@/components/dashboard/TopTags";
import WeeklyChart from "@/components/dashboard/WeeklyChart";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { JobBoardEntriesStats } from "@/lib/types";
import { activeCount } from "@/lib/jobBoard/useJobCounts";

const HomePage = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<JobBoardEntriesStats>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void getJobBoardEntriesStats()
      .then(setStats)
      .catch((error) => {
        console.error(error);
        toast.error("Failed to get job board entries stats");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  // Signing in lands here; a new user goes to the first run page instead, until they skip or finish it or
  // have a job. Other pages stay reachable, so a step can be done from them.
  const isNewUser = user?.setup_completed === false && stats?.counts.total === 0;
  useEffect(() => {
    if (isNewUser) router.replace("/welcome");
  }, [isNewUser, router]);

  if (isLoading || isNewUser) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader />
      </div>
    );
  }

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const active = stats ? activeCount(stats.counts) : 0;
  const weekDifference = stats ? stats.this_week - stats.last_week : 0;
  const offers = stats ? stats.counts.offered + stats.counts.accepted : 0;
  const isEmpty = stats?.counts.total === 0;

  const summary = () => {
    if (!stats) return "We couldn't load your numbers. Refresh to try again.";
    if (isEmpty) return "Bring in your CV, add a job, and see how well they fit.";

    const closing = stats.closing_soon_count;
    return `${active} active ${active === 1 ? "application" : "applications"}${closing > 0 ? `, ${closing} closing soon` : ""}`;
  };

  return (
    <PageContainer className="flex flex-col gap-4 pt-6 sm:pt-10">
      {/* The landing page's amber, kept short so the numbers sit near the top. */}
      <section className="overflow-hidden rounded-2xl bg-candido text-candido-black">
        <div className="flex flex-col gap-5 px-6 py-6 sm:px-8 md:flex-row md:items-end md:justify-between">
          <div className="flex min-w-0 flex-col gap-3">
            <Eyebrow className="text-candido-black/70 [&>span]:bg-candido-black">
              {format(new Date(), "EEEE d MMMM")}
            </Eyebrow>
            <div>
              <h1 className="font-heading text-[clamp(36px,3.6vw,52px)] leading-[0.94] font-black">
                {firstName ? `Hi, ${firstName}` : "Your dashboard"}
              </h1>
              <p className="mt-2 text-base">{summary()}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {stats && isEmpty ? (
              <Button asChild size="lg">
                <Link href="/welcome">
                  Get started
                  <ArrowRightIcon />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" variant="outline" className="border-candido-black/15">
                  <Link href="/applications">Applications</Link>
                </Button>
                <Button asChild size="lg">
                  <Link href="/board">
                    Open your board
                    <ArrowRightIcon />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="hazard-tape h-3" aria-hidden />
      </section>

      {stats && !isEmpty && (
        <>
          {/* Each tile spans three shared rows, so labels that wrap on phones don't push one number below the next. */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label="Added this week"
              value={stats.this_week}
              detail={
                weekDifference === 0
                  ? "Same as last week"
                  : `${weekDifference > 0 ? "▲" : "▼"} ${Math.abs(weekDifference)} from last week`
              }
            />
            <StatTile label="Active" value={active} detail="Applied, assessment or interview" />
            <StatTile
              label="Response rate"
              value={stats.sent_count > 0 ? `${stats.response_rate}%` : "—"}
              detail={
                stats.sent_count > 0
                  ? `${stats.responded_count} of ${stats.sent_count} applications`
                  : "No applications sent yet"
              }
            />
            <StatTile
              label="Offers"
              value={offers}
              detail={stats.counts.accepted > 0 ? `${stats.counts.accepted} accepted` : "None accepted yet"}
              highlight={offers > 0}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <DashboardCard title="Jobs added per week" description={`Last ${stats.weekly_counts.length} weeks`}>
              <WeeklyChart weeks={stats.weekly_counts} />
            </DashboardCard>
            <DashboardCard title="Pipeline" description="Where your jobs stand now">
              <PipelineChart counts={stats.counts} />
            </DashboardCard>
            <DashboardCard title="Closing soon" description="Jobs you haven't applied to yet">
              <ClosingSoon jobs={stats.closing_soon} total={stats.closing_soon_count} />
            </DashboardCard>
            <DashboardCard title="Top tags" description="Most used across your jobs">
              <TopTags tags={stats.top_tags} />
            </DashboardCard>
          </div>
        </>
      )}
    </PageContainer>
  );
};

export default HomePage;
