export default interface Provider {
    fetchRepositories(orgApiUrl: string): Promise<Repository[]>;
}

export interface Repository {
    name: string;
    fullName: string;
    private: boolean;
    description?: string;
    url: string;
    commitsUrl: string;
    createdAt?: Date;
    updatedAt?: Date;
    pushedAt?: Date;
    gitUrl: string;
    sshUrl: string;
    language?: string;
    homepage?: string;
    size: number;
    licenseUrl?: string;
}
