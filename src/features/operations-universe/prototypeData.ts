import type { StaffCategory, ScheduleCategory } from './types';

export interface DemoStaffMember {
  id: string;
  name: string;
  category: StaffCategory;
  availableNow: string;
  nextJob: string;
  todaysJobs: string;
  skills: string;
  location: string;
}

export const DEMO_STAFF: DemoStaffMember[] = [
  {
    id: 'sameer',
    name: 'Sameer',
    category: 'available',
    availableNow: 'Yes, until 6:00 PM',
    nextJob: 'None scheduled',
    todaysJobs: '2 completed',
    skills: 'AC Technician, Electrical',
    location: 'Al Barsha',
  },
  {
    id: 'rafiq',
    name: 'Rafiq',
    category: 'available',
    availableNow: 'Yes, until 4:30 PM',
    nextJob: 'None scheduled',
    todaysJobs: '1 completed',
    skills: 'Plumbing',
    location: 'Deira',
  },
  {
    id: 'technician-3',
    name: 'Technician 3',
    category: 'booked',
    availableNow: 'No - on site',
    nextJob: 'Villa 12, Jumeirah - 3:00 PM',
    todaysJobs: '1 in progress',
    skills: 'Multi-trade',
    location: 'Jumeirah',
  },
  {
    id: 'khalid',
    name: 'Khalid',
    category: 'absent',
    availableNow: 'No - on leave',
    nextJob: '-',
    todaysJobs: '0',
    skills: 'Carpentry',
    location: '-',
  },
];

export interface DemoJob {
  id: string;
  title: string;
  category: ScheduleCategory;
  customer: string;
  location: string;
  requiredSkill: string;
  priority: string;
}

export const DEMO_JOBS: DemoJob[] = [
  {
    id: 'job-101',
    title: 'AC Servicing - Villa 45',
    category: 'unassigned',
    customer: 'Al Futtaim Villa',
    location: 'Al Barsha',
    requiredSkill: 'AC Technician',
    priority: 'Normal',
  },
  {
    id: 'job-102',
    title: 'Leak Repair - Apt 302',
    category: 'today',
    customer: 'Marina Heights',
    location: 'Dubai Marina',
    requiredSkill: 'Plumbing',
    priority: 'High',
  },
  {
    id: 'job-103',
    title: 'Electrical Fault',
    category: 'attention',
    customer: 'Palm Residence',
    location: 'Palm Jumeirah',
    requiredSkill: 'Electrical',
    priority: 'Urgent',
  },
  {
    id: 'job-104',
    title: 'Routine PPM Visit',
    category: 'tomorrow',
    customer: 'Business Bay Tower',
    location: 'Business Bay',
    requiredSkill: 'Multi-trade',
    priority: 'Normal',
  },
];

/** Which demo staff IDs show up as "suitable" around a given demo job when it's centered. */
export const SUITABLE_STAFF_FOR_JOB: Record<string, string[]> = {
  'job-101': ['sameer', 'rafiq'],
};
