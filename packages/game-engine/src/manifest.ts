import { MVP_LEVEL_ID, PRODUCT_ID, levelManifestSchema } from '@alibi/protocol';
import type { LevelManifest } from '@alibi/protocol';

export const LEVEL_MANIFEST: LevelManifest = levelManifestSchema.parse({
  productId: PRODUCT_ID,
  levelId: MVP_LEVEL_ID,
  title: 'The Last Exhibit',
  narrative:
    'During a private evening exhibition, the museum curator is killed. A short security blackout disrupts the timeline. Four suspects, four rooms, two weapons, and two time windows define exactly 64 mechanically valid cases.',
  suspects: [
    {
      id: 'suspect_archivist',
      name: 'Ada Vale',
      role: 'Museum archivist',
      publicDirection: 'Precise, defensive, and protective of institutional records.',
      primaryRoomId: 'room_archive',
    },
    {
      id: 'suspect_security',
      name: 'Marcus Reed',
      role: 'Head of security',
      publicDirection: 'Controlled, procedural, and concerned about the blackout.',
      primaryRoomId: 'room_gallery',
    },
    {
      id: 'suspect_patron',
      name: 'Celeste Moreau',
      role: 'Principal patron',
      publicDirection: 'Charismatic, status-conscious, and skilled at redirection.',
      primaryRoomId: 'room_conservatory',
    },
    {
      id: 'suspect_restorer',
      name: 'Theo Lin',
      role: 'Art restorer',
      publicDirection: 'Observant, anxious, and technically knowledgeable.',
      primaryRoomId: 'room_restoration',
    },
  ],
  rooms: [
    {
      id: 'room_gallery',
      name: 'Grand Gallery',
      description:
        'A marble atrium beneath the exhibition clock, linking every public route through the museum.',
      observations: [
        {
          id: 'observation_gallery_clock',
          roomId: 'room_gallery',
          title: 'Stopped exhibition clock',
          description:
            'The display clock froze during the blackout, but a nearby mechanical clock continued to mark time.',
          evidenceClass: 'public-observation',
        },
        {
          id: 'observation_gallery_glass',
          roomId: 'room_gallery',
          title: 'Untouched display glass',
          description:
            'The central cases are clean and locked; no public exhibit appears to have been forced.',
          evidenceClass: 'public-observation',
        },
      ],
    },
    {
      id: 'room_restoration',
      name: 'Restoration Lab',
      description:
        'A bright technical room of solvents, magnifiers, and carefully catalogued conservation tools.',
      observations: [
        {
          id: 'observation_restoration_solvent',
          roomId: 'room_restoration',
          title: 'Fresh solvent trace',
          description:
            'A sharp solvent scent lingers near a newly cleaned frame, consistent with routine restoration work.',
          evidenceClass: 'public-observation',
        },
        {
          id: 'observation_restoration_tools',
          roomId: 'room_restoration',
          title: 'Signed tool ledger',
          description:
            'The tool ledger is complete, though its final entry was written in a noticeably hurried hand.',
          evidenceClass: 'public-observation',
        },
      ],
    },
    {
      id: 'room_archive',
      name: 'Archive Vault',
      description:
        'A climate-controlled vault of donor records, access ledgers, and restricted institutional correspondence.',
      observations: [
        {
          id: 'observation_archive_access',
          roomId: 'room_archive',
          title: 'Interrupted access log',
          description:
            'The electronic access log contains a clean gap matching the security blackout.',
          evidenceClass: 'public-observation',
        },
        {
          id: 'observation_archive_dust',
          roomId: 'room_archive',
          title: 'Recently moved folio',
          description:
            'One heavy donor folio sits slightly out of line, with a clean rectangle in the surrounding dust.',
          evidenceClass: 'public-observation',
        },
      ],
    },
    {
      id: 'room_conservatory',
      name: 'Rooftop Conservatory',
      description:
        'A glass-roofed reception space overlooking the city, used for gala arrivals and discreet meetings.',
      observations: [
        {
          id: 'observation_conservatory_glass',
          roomId: 'room_conservatory',
          title: 'Abandoned gala glass',
          description:
            'A single untouched drink remains on a private table, its place card turned face down.',
          evidenceClass: 'public-observation',
        },
        {
          id: 'observation_conservatory_route',
          roomId: 'room_conservatory',
          title: 'Service stair ajar',
          description:
            'The narrow service stair was left unlatched, offering a quiet route away from the gala.',
          evidenceClass: 'public-observation',
        },
      ],
    },
  ],
  weapons: [
    {
      id: 'weapon_dagger',
      name: 'Ceremonial Dagger',
      description: 'A decorative presentation blade associated with the private exhibition.',
    },
    {
      id: 'weapon_bust',
      name: 'Bronze Bust',
      description: 'A compact portrait sculpture normally displayed in the curator’s study.',
    },
  ],
  timeWindows: [
    {
      id: 'time_pre_blackout',
      name: 'Before the blackout',
      description: 'The final minutes while the museum lights were still on.',
    },
    {
      id: 'time_post_blackout',
      name: 'After the blackout',
      description: 'The first minutes after emergency lighting returned.',
    },
  ],
});
