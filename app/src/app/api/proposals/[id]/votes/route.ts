import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

interface Vote {
  id: number;
  proposal_id: number;
  voter: string;
  support: number;
  weight: string;
  created_at: string;
}

interface VotesResponse {
  votes: Vote[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const searchParams = request.nextUrl.searchParams;
  const page = Number(searchParams.get("page") ?? 0);
  const pageSize = Math.min(Number(searchParams.get("pageSize") ?? 20), 100);
  const sort = searchParams.get("sort") ?? "newest";

  try {
    const offset = page * pageSize;
    const orderBy = sort === "weight"
      ? "weight DESC"
      : sort === "address"
        ? "voter ASC"
        : "created_at DESC";

    const [countRes, votesRes] = await Promise.all([
      fetch(`${BACKEND_URL}/proposals/${id}/votes/count`),
      fetch(
        `${BACKEND_URL}/proposals/${id}/votes?offset=${offset}&limit=${pageSize}&order=${orderBy}`
      ),
    ]);

    if (!countRes.ok || !votesRes.ok) {
      return NextResponse.json(
        { error: "Failed to fetch votes" },
        { status: 500 }
      );
    }

    const countData = await countRes.json();
    const votesData = await votesRes.json();
    const total = countData.count ?? 0;
    const votes = votesData.votes ?? [];

    return NextResponse.json({
      votes,
      total,
      page,
      pageSize,
      hasMore: offset + pageSize < total,
    } as VotesResponse);
  } catch (error) {
    console.error("Failed to fetch votes:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}