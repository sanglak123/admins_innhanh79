import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
// import api_auth from "./api_auth";


let isRefreshing = false;
let refreshQueue: Array<() => void> = [];

// Notify all waiting requests once refresh done
const notifyQueue = () => {
    refreshQueue.forEach((cb) => cb());
    refreshQueue = [];
};

// Axios gốc (dùng để gọi refresh token)
export const rootAxios = axios.create({
    baseURL: process.env.NEXT_PUBLIC_BE_URL + "/api/v1",
    withCredentials: true, // để gửi cookie refresh_token
});

export const RefreshToken = async (): Promise<string | null> => {
    try {
        const res = await rootAxios.get("/auth/refresh-token");
        const newToken = res.data?.access_token;
        if (newToken) {
            localStorage.setItem("access_token", newToken);
            return newToken;
        }
        return null;
    } catch (err: any) {
        const status = err?.response?.status;

        // Nếu 401/403 => refresh token hết hạn => logout
        if (status === 401 || status === 403) {
            localStorage.removeItem("access_token");
        }
        return null;
    }
};


export const CreateAxiosInstance = () => {
    const instance = axios.create({
        baseURL: process.env.NEXT_PUBLIC_BE_URL + "/api/v1",
        withCredentials: true,
    });

    // REQUEST interceptor
    instance.interceptors.request.use(
        async (config: InternalAxiosRequestConfig) => {
            const token = localStorage.getItem("access_token");
            if (token) {
                config.headers.Authorization = `Bearer ${token}`;
            }
            return config;
        },
        (error) => Promise.reject(error)
    );

    // RESPONSE interceptor
    instance.interceptors.response.use(
        (res) => res,
        async (error: AxiosError) => {
            const original = error.config as InternalAxiosRequestConfig & {
                _retry?: boolean;
            };
            const status = error.response?.status;

            // Nếu token hết hạn → refresh
            if (status === 401 && !original._retry) {
                original._retry = true;

                if (!isRefreshing) {
                    isRefreshing = true;
                    try {
                        const newToken = await RefreshToken();
                        if (!newToken) {
                            // Refresh thất bại → logout
                            // await api_auth.Signout(true);
                            localStorage.removeItem("access_token");
                            throw new Error("Refresh token expired");
                        }
                    } finally {
                        isRefreshing = false;
                        notifyQueue();
                    }
                } else {
                    // Nếu đang refresh thì chờ
                    await new Promise<void>((resolve) => refreshQueue.push(resolve));
                }

                const newToken = localStorage.getItem("access_token");
                if (newToken && original.headers) {
                    original.headers["Authorization"] = `Bearer ${newToken}`;
                    return instance(original); // retry
                }
            }

            return Promise.reject(error);
        }
    );

    return instance;
};

const axiosJWT = CreateAxiosInstance();
export default axiosJWT;