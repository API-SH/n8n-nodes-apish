export interface Param { name: string; required: boolean; type: string; description: string; example?: string; enum?: string[]; default?: string }
export interface Operation { value: string; name: string; credits: number; params: Param[] }
export interface Platform { value: string; name: string; operations: Operation[] }
