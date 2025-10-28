export interface ProductLink {
    id: number;
    link: string;
    exists: boolean;
}

export interface ExcelData {
    links: ProductLink[];
}