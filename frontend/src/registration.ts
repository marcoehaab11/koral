export type Option = {id:string;labelAr:string;labelEn:string;detailAr?:string;detailEn?:string};
export type RegistrationField = {
  id:string;labelAr:string;labelEn:string;kind:'text'|'choice'|'date'|'photo'|'recording';
  required:boolean;visible:boolean;rule:'any'|'arabic'|'digits';digits?:number|null;multiple:boolean;options?:Option[]|null;
};
export type PublicRegistration = {revision:string;fields:RegistrationField[]};
export type RegistrationSchema = PublicRegistration & {statuses:Option[]};
export type RegistrationAnswer = Pick<RegistrationField,'id'|'labelAr'|'labelEn'|'kind'> & {value:string};
export const registrationEndpoint='admin/registration-form';
export const nameIds=['first-name','second-name','third-name','last-name'];
