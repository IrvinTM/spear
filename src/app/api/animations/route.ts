import { NextResponse } from 'next/server';
import { listAnimations } from '@/lib/animations';

export async function GET() {
  try {
    const animations = await listAnimations();
    return NextResponse.json({ animations });
  } catch (error) {
    console.error('Failed to list animations', error);
    return NextResponse.json({ error: 'Failed to list animations' }, { status: 500 });
  }
}
