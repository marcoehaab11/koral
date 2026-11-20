export const voiceLabels = {
  unsure: ['Not sure yet','لسه مش متأكد'],
  soprano: ['Soprano','سوبرانو'],
  alto: ['Alto','ألتو'],
  tenor: ['Tenor','تينور'],
  bass: ['Bass','باص'],
  other: ['Other','نوع آخر'],
} as const;

export const statusLabels = {
  new: ['New','جديد'],
  contacted: ['Contacted','تم التواصل'],
  audition: ['Audition','اختبار صوت'],
  accepted: ['Accepted','مقبول'],
  declined: ['Declined','لم يُقبل'],
} as const;

export type Voice = keyof typeof voiceLabels;
export type ApplicationStatus = keyof typeof statusLabels;
export type Applicant = {
  id: number; name: string; email: string; phone: string; voice: Voice; status: ApplicationStatus; createdAt: string;
};
export type ApplicationDetail = {
  applicant: Applicant; experience: string; notes: string; revision: string; updatedAt: string;
};
