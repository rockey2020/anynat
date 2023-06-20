#基础镜像
FROM node:20.3.0-slim

#作者信息
LABEL maintainer="rockey <rockey543400@foxmail.com>"

#设置环境变量
ENV VITE_RUNTIME_TYPE server

#创建项目文件夹
RUN mkdir -p /root/anynat

#设置项目文件夹为基础目录
WORKDIR /root/anynat

#复制当前文件夹下所有文件到项目文件里面
COPY ./ /root/anynat

#linux环境搭建命令
RUN apt update -y && apt upgrade -y && apt install vim openssh-server sudo -y && apt autoremove -y
#修改root用户密码并允许通过ssh登录该容器
RUN echo 'root:root' | chpasswd
RUN echo "PermitRootLogin yes" >> /etc/ssh/sshd_config

#执行项目所需要的部署命令
RUN npm i pm2 -g
RUN npm i

#暴露端口
EXPOSE 2333 443 22

#设置配置数据目录映射
VOLUME ["/root/anynat/logs/pm2/logs","/root/anynat/userConfig"]

CMD /etc/init.d/ssh restart && npm run prod-runtime
