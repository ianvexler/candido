"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CalendarPlusIcon, GitBranchIcon, KanbanIcon, TrendingUpIcon, TrophyIcon } from "lucide-react";
import getJobBoardEntriesStats from "@/api/resources/jobBoardEntries/getJobBoardEntriesStats";
import Description from "@/components/common/Description";
import Loader from "@/components/common/Loader";
import PageContainer from "@/components/common/PageContainer";
import Title from "@/components/common/Title";
import ClosingSoon from "@/components/dashboard/ClosingSoon";
import DashboardCard from "@/components/dashboard/DashboardCard";
import PipelineChart from "@/components/dashboard/PipelineChart";
import StatTile from "@/components/dashboard/StatTile";
import TopTags from "@/components/dashboard/TopTags";
import WeeklyChart from "@/components/dashboard/WeeklyChart";
import { Button } from "@/components/ui/Button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/Empty";
import { useAuth } from "@/contexts/AuthContext";
import Logo from "@/lib/images/MainLogo.png";
import { JobBoardEntriesStats } from "@/lib/types";

const HomePage = () => {
  const { user } = useAuth();
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader />
      </div>
    );
  }

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const active = stats ? stats.counts.applied + stats.counts.assessment + stats.counts.interview : 0;
  const weekDifference = stats ? stats.this_week - stats.last_week : 0;
  const offers = stats ? stats.counts.offered + stats.counts.accepted : 0;
  const isEmpty = stats?.counts.total === 0;

  const summary = () => {
    if (!stats) return "We couldn't load your numbers. Refresh to try again.";
    if (isEmpty) return "Let's get your job search started.";

    const closing = stats.closing_soon_count;
    return `${active} active ${active === 1 ? "application" : "applications"}${closing > 0 ? `, ${closing} closing soon` : ""}`;
  };

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <div className="mb-2 flex items-center justify-between gap-6">
          <div className="min-w-0">
            <Title>{firstName ? `Hi, ${firstName}` : "Dashboard"}</Title>
            <Description className="mt-1">{summary()}</Description>
          </div>
          <div className="hidden shrink-0 rounded-lg bg-candido-black px-5 py-3 sm:block">
            <Image src={Logo} alt="Candido" height={36} />
          </div>
        </div>

        {stats && isEmpty && (
          <Empty className="border py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="bg-candido/25">
                <KanbanIcon aria-hidden />
              </EmptyMedia>
              <EmptyTitle>No jobs yet</EmptyTitle>
              <EmptyDescription>
                Add the first job you&apos;re interested in and your progress will show up here.
              </EmptyDescription>
            </EmptyHeader>
            <Button asChild variant="candido">
              <Link href="/board">Add your first job</Link>
            </Button>
          </Empty>
        )}

        {stats && !isEmpty && (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile
                label="Added this week"
                value={stats.this_week}
                detail={
                  weekDifference === 0
                    ? "Same as last week"
                    : `${weekDifference > 0 ? "▲" : "▼"} ${Math.abs(weekDifference)} from last week`
                }
                icon={CalendarPlusIcon}
                iconClassName="bg-amber-100 text-amber-800"
              />
              <StatTile
                label="Active"
                value={active}
                detail="Applied, assessment or interview"
                icon={GitBranchIcon}
                iconClassName="bg-indigo-100 text-indigo-700"
              />
              <StatTile
                label="Response rate"
                value={stats.sent_count > 0 ? `${stats.response_rate}%` : "—"}
                detail={
                  stats.sent_count > 0
                    ? `${stats.responded_count} of ${stats.sent_count} applications`
                    : "No applications sent yet"
                }
                icon={TrendingUpIcon}
                iconClassName="bg-cyan-100 text-cyan-800"
              />
              <StatTile
                label="Offers"
                value={offers}
                detail={stats.counts.accepted > 0 ? `${stats.counts.accepted} accepted` : "None accepted yet"}
                icon={TrophyIcon}
                iconClassName="bg-emerald-100 text-emerald-800"
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
      </div>
    </PageContainer>
  );
};

export default HomePage;
