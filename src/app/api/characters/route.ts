import { NextResponse } from 'next/server';
import { listCharacters, getActiveCharacter } from '@/lib/characters';

export async function GET() {
  try {
    const characters = await listCharacters();
    const active = await getActiveCharacter();
    return NextResponse.json({ characters, active });
  } catch (error) {
    console.error('Failed to list characters', error);
    return NextResponse.json({ error: 'Failed to list characters' }, { status: 500 });
  }
}
